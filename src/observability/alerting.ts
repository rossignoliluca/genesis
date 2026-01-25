/**
 * Alerting System
 *
 * Send alerts to various channels (Slack, PagerDuty, etc.)
 * Features:
 * - Multiple channel support
 * - Alert severity levels
 * - Rate limiting to prevent alert storms
 * - Alert aggregation
 * - Retry with backoff
 */

export type AlertSeverity = 'info' | 'warning' | 'error' | 'critical';
export type AlertChannel = 'slack' | 'pagerduty' | 'webhook' | 'console';

export interface Alert {
  id: string;
  title: string;
  message: string;
  severity: AlertSeverity;
  source: string;
  timestamp: number;
  labels?: Record<string, string>;
  annotations?: Record<string, string>;
  // For error alerts
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

export interface ChannelConfig {
  type: AlertChannel;
  enabled: boolean;
  // Minimum severity to send
  minSeverity: AlertSeverity;
  // Channel-specific config
  config: SlackConfig | PagerDutyConfig | WebhookConfig | Record<string, unknown>;
}

export interface SlackConfig {
  webhookUrl: string;
  channel?: string;
  username?: string;
  iconEmoji?: string;
}

export interface PagerDutyConfig {
  routingKey: string;
  apiUrl?: string;
}

export interface WebhookConfig {
  url: string;
  method?: 'POST' | 'PUT';
  headers?: Record<string, string>;
}

export interface AlerterConfig {
  // Alert channels
  channels: ChannelConfig[];
  // Rate limiting
  rateLimitPerMinute: number;
  // Aggregation window in ms
  aggregationWindowMs: number;
  // Default source name
  defaultSource: string;
  // Enable/disable alerting globally
  enabled: boolean;
}

const SEVERITY_LEVELS: Record<AlertSeverity, number> = {
  info: 0,
  warning: 1,
  error: 2,
  critical: 3,
};

const SEVERITY_COLORS: Record<AlertSeverity, string> = {
  info: '#36a64f',      // green
  warning: '#ffcc00',   // yellow
  error: '#ff6600',     // orange
  critical: '#ff0000',  // red
};

const SEVERITY_EMOJIS: Record<AlertSeverity, string> = {
  info: 'information_source',
  warning: 'warning',
  error: 'x',
  critical: 'rotating_light',
};

const DEFAULT_CONFIG: AlerterConfig = {
  channels: [],
  rateLimitPerMinute: 60,
  aggregationWindowMs: 60000,
  defaultSource: 'genesis',
  enabled: true,
};

/**
 * Alerter class for sending alerts
 */
export class Alerter {
  private config: AlerterConfig;
  private alertCounts: Map<string, { count: number; windowStart: number }> = new Map();
  private pendingAlerts: Map<string, Alert[]> = new Map();
  private aggregationTimer: NodeJS.Timeout | null = null;

  constructor(config: Partial<AlerterConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Start aggregation timer if needed
    if (this.config.aggregationWindowMs > 0) {
      this.startAggregationTimer();
    }
  }

  /**
   * Send an alert
   */
  async alert(alert: Omit<Alert, 'id' | 'timestamp'>): Promise<boolean> {
    if (!this.config.enabled) {
      return false;
    }

    const fullAlert: Alert = {
      ...alert,
      id: this.generateAlertId(),
      timestamp: Date.now(),
      source: alert.source || this.config.defaultSource,
    };

    // Check rate limit
    if (!this.checkRateLimit(fullAlert)) {
      return false;
    }

    // Aggregation
    if (this.config.aggregationWindowMs > 0) {
      const key = this.getAggregationKey(fullAlert);
      let pending = this.pendingAlerts.get(key);
      if (!pending) {
        pending = [];
        this.pendingAlerts.set(key, pending);
      }
      pending.push(fullAlert);
      return true;
    }

    // Send immediately
    return this.sendAlert(fullAlert);
  }

  /**
   * Send info alert
   */
  async info(title: string, message: string, options?: Partial<Alert>): Promise<boolean> {
    return this.alert({ title, message, severity: 'info', source: this.config.defaultSource, ...options });
  }

  /**
   * Send warning alert
   */
  async warning(title: string, message: string, options?: Partial<Alert>): Promise<boolean> {
    return this.alert({ title, message, severity: 'warning', source: this.config.defaultSource, ...options });
  }

  /**
   * Send error alert
   */
  async error(title: string, error: Error, options?: Partial<Alert>): Promise<boolean> {
    return this.alert({
      title,
      message: error.message,
      severity: 'error',
      source: this.config.defaultSource,
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack,
      },
      ...options,
    });
  }

  /**
   * Send critical alert
   */
  async critical(title: string, message: string, options?: Partial<Alert>): Promise<boolean> {
    return this.alert({ title, message, severity: 'critical', source: this.config.defaultSource, ...options });
  }

  /**
   * Flush pending alerts
   */
  async flush(): Promise<void> {
    for (const [key, alerts] of this.pendingAlerts) {
      if (alerts.length === 0) continue;

      if (alerts.length === 1) {
        await this.sendAlert(alerts[0]);
      } else {
        // Aggregate
        const aggregated = this.aggregateAlerts(alerts);
        await this.sendAlert(aggregated);
      }
    }
    this.pendingAlerts.clear();
  }

  /**
   * Stop alerter
   */
  stop(): void {
    if (this.aggregationTimer) {
      clearInterval(this.aggregationTimer);
      this.aggregationTimer = null;
    }
  }

  /**
   * Add a channel
   */
  addChannel(channel: ChannelConfig): void {
    this.config.channels.push(channel);
  }

  /**
   * Get stats
   */
  getStats(): {
    pendingAlerts: number;
    channelCount: number;
    rateLimitInfo: Map<string, { count: number; windowStart: number }>;
  } {
    let pendingCount = 0;
    for (const alerts of this.pendingAlerts.values()) {
      pendingCount += alerts.length;
    }

    return {
      pendingAlerts: pendingCount,
      channelCount: this.config.channels.length,
      rateLimitInfo: new Map(this.alertCounts),
    };
  }

  private async sendAlert(alert: Alert): Promise<boolean> {
    const promises: Promise<boolean>[] = [];

    for (const channel of this.config.channels) {
      if (!channel.enabled) continue;
      if (SEVERITY_LEVELS[alert.severity] < SEVERITY_LEVELS[channel.minSeverity]) continue;

      switch (channel.type) {
        case 'slack':
          promises.push(this.sendToSlack(alert, channel.config as unknown as SlackConfig));
          break;
        case 'pagerduty':
          promises.push(this.sendToPagerDuty(alert, channel.config as unknown as PagerDutyConfig));
          break;
        case 'webhook':
          promises.push(this.sendToWebhook(alert, channel.config as unknown as WebhookConfig));
          break;
        case 'console':
          promises.push(this.sendToConsole(alert));
          break;
      }
    }

    const results = await Promise.allSettled(promises);
    return results.some(r => r.status === 'fulfilled' && r.value);
  }

  private async sendToSlack(alert: Alert, config: SlackConfig): Promise<boolean> {
    const payload = {
      channel: config.channel,
      username: config.username || 'Genesis Alerts',
      icon_emoji: config.iconEmoji || `:${SEVERITY_EMOJIS[alert.severity]}:`,
      attachments: [{
        color: SEVERITY_COLORS[alert.severity],
        title: alert.title,
        text: alert.message,
        fields: [
          { title: 'Severity', value: alert.severity.toUpperCase(), short: true },
          { title: 'Source', value: alert.source, short: true },
          ...(alert.labels ? Object.entries(alert.labels).map(([k, v]) => ({
            title: k,
            value: v,
            short: true,
          })) : []),
        ],
        footer: 'Genesis Alerting',
        ts: Math.floor(alert.timestamp / 1000),
      }],
    };

    try {
      const response = await fetch(config.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      return response.ok;
    } catch (error) {
      console.error('Slack alert failed:', error);
      return false;
    }
  }

  private async sendToPagerDuty(alert: Alert, config: PagerDutyConfig): Promise<boolean> {
    const severityMap: Record<AlertSeverity, string> = {
      info: 'info',
      warning: 'warning',
      error: 'error',
      critical: 'critical',
    };

    const payload = {
      routing_key: config.routingKey,
      event_action: 'trigger',
      dedup_key: alert.id,
      payload: {
        summary: `${alert.title}: ${alert.message}`,
        source: alert.source,
        severity: severityMap[alert.severity],
        timestamp: new Date(alert.timestamp).toISOString(),
        custom_details: {
          ...alert.labels,
          ...alert.annotations,
          ...(alert.error ? { error: alert.error } : {}),
        },
      },
    };

    try {
      const response = await fetch(config.apiUrl || 'https://events.pagerduty.com/v2/enqueue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      return response.ok;
    } catch (error) {
      console.error('PagerDuty alert failed:', error);
      return false;
    }
  }

  private async sendToWebhook(alert: Alert, config: WebhookConfig): Promise<boolean> {
    try {
      const response = await fetch(config.url, {
        method: config.method || 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...config.headers,
        },
        body: JSON.stringify(alert),
      });
      return response.ok;
    } catch (error) {
      console.error('Webhook alert failed:', error);
      return false;
    }
  }

  private async sendToConsole(alert: Alert): Promise<boolean> {
    const prefix = `[ALERT:${alert.severity.toUpperCase()}]`;
    const message = `${prefix} ${alert.title}: ${alert.message}`;

    switch (alert.severity) {
      case 'critical':
      case 'error':
        console.error(message, alert.error || '');
        break;
      case 'warning':
        console.warn(message);
        break;
      default:
        console.log(message);
    }
    return true;
  }

  private checkRateLimit(alert: Alert): boolean {
    const key = `${alert.source}:${alert.severity}`;
    const now = Date.now();
    const windowMs = 60000; // 1 minute

    let entry = this.alertCounts.get(key);
    if (!entry || now - entry.windowStart > windowMs) {
      entry = { count: 0, windowStart: now };
      this.alertCounts.set(key, entry);
    }

    if (entry.count >= this.config.rateLimitPerMinute) {
      return false;
    }

    entry.count++;
    return true;
  }

  private getAggregationKey(alert: Alert): string {
    return `${alert.source}:${alert.severity}:${alert.title}`;
  }

  private aggregateAlerts(alerts: Alert[]): Alert {
    const first = alerts[0];
    return {
      ...first,
      message: `${alerts.length} occurrences:\n${alerts.slice(0, 5).map(a => `- ${a.message}`).join('\n')}${alerts.length > 5 ? `\n... and ${alerts.length - 5} more` : ''}`,
      annotations: {
        ...first.annotations,
        aggregated_count: String(alerts.length),
      },
    };
  }

  private startAggregationTimer(): void {
    this.aggregationTimer = setInterval(() => {
      this.flush().catch(console.error);
    }, this.config.aggregationWindowMs);

    if (this.aggregationTimer.unref) {
      this.aggregationTimer.unref();
    }
  }

  private generateAlertId(): string {
    return `alert-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }
}

// Global alerter
let globalAlerter: Alerter | null = null;

/**
 * Get global alerter
 */
export function getAlerter(config?: Partial<AlerterConfig>): Alerter {
  if (!globalAlerter) {
    const channels: ChannelConfig[] = [];

    // Add Slack if configured
    if (process.env.SLACK_WEBHOOK_URL) {
      channels.push({
        type: 'slack',
        enabled: true,
        minSeverity: (process.env.SLACK_MIN_SEVERITY as AlertSeverity) || 'warning',
        config: {
          webhookUrl: process.env.SLACK_WEBHOOK_URL,
          channel: process.env.SLACK_CHANNEL,
        } as SlackConfig,
      });
    }

    // Add PagerDuty if configured
    if (process.env.PAGERDUTY_ROUTING_KEY) {
      channels.push({
        type: 'pagerduty',
        enabled: true,
        minSeverity: 'error',
        config: {
          routingKey: process.env.PAGERDUTY_ROUTING_KEY,
        } as PagerDutyConfig,
      });
    }

    // Add console in development
    if (process.env.NODE_ENV === 'development' || process.env.ALERT_CONSOLE === 'true') {
      channels.push({
        type: 'console',
        enabled: true,
        minSeverity: 'info',
        config: {},
      });
    }

    globalAlerter = new Alerter({
      ...config,
      channels: [...channels, ...(config?.channels || [])],
    });
  }
  return globalAlerter;
}

/**
 * Reset global alerter
 */
export function resetAlerter(): void {
  if (globalAlerter) {
    globalAlerter.stop();
  }
  globalAlerter = null;
}

/**
 * Send info alert via global alerter
 */
export async function alertInfo(title: string, message: string, options?: Partial<Alert>): Promise<boolean> {
  return getAlerter().info(title, message, options);
}

/**
 * Send warning alert via global alerter
 */
export async function alertWarning(title: string, message: string, options?: Partial<Alert>): Promise<boolean> {
  return getAlerter().warning(title, message, options);
}

/**
 * Send error alert via global alerter
 */
export async function alertError(title: string, error: Error, options?: Partial<Alert>): Promise<boolean> {
  return getAlerter().error(title, error, options);
}

/**
 * Send critical alert via global alerter
 */
export async function alertCritical(title: string, message: string, options?: Partial<Alert>): Promise<boolean> {
  return getAlerter().critical(title, message, options);
}
