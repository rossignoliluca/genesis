/**
 * Alert System
 *
 * Sends notifications via webhooks (Telegram, Discord, Slack).
 * Integrates with balance monitor and revenue tracker.
 */

export type AlertLevel = 'info' | 'warning' | 'error' | 'success';
export type AlertChannel = 'telegram' | 'discord' | 'slack' | 'webhook';

export interface Alert {
  level: AlertLevel;
  title: string;
  message: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

export interface AlertConfig {
  telegram?: {
    botToken: string;
    chatId: string;
  };
  discord?: {
    webhookUrl: string;
  };
  slack?: {
    webhookUrl: string;
  };
  custom?: {
    webhookUrl: string;
    headers?: Record<string, string>;
  };
  enabled: boolean;
  minLevel: AlertLevel;
  rateLimitMs?: number;  // Min time between alerts
}

const LEVEL_PRIORITY: Record<AlertLevel, number> = {
  info: 0,
  success: 1,
  warning: 2,
  error: 3,
};

const LEVEL_EMOJI: Record<AlertLevel, string> = {
  info: 'i',
  success: '+',
  warning: '!',
  error: 'X',
};

export class AlertSystem {
  private config: AlertConfig;
  private lastAlertTime: number = 0;
  private alertHistory: Alert[] = [];
  private maxHistory: number = 100;

  constructor(config?: Partial<AlertConfig>) {
    this.config = {
      enabled: config?.enabled ?? true,
      minLevel: config?.minLevel ?? 'info',
      rateLimitMs: config?.rateLimitMs ?? 1000,
      telegram: config?.telegram,
      discord: config?.discord,
      slack: config?.slack,
      custom: config?.custom,
    };
  }

  /**
   * Configure the alert system from environment variables.
   */
  static fromEnv(): AlertSystem {
    return new AlertSystem({
      enabled: process.env.GENESIS_ALERTS_ENABLED !== 'false',
      minLevel: (process.env.GENESIS_ALERTS_LEVEL as AlertLevel) ?? 'info',
      telegram: process.env.GENESIS_TELEGRAM_BOT_TOKEN && process.env.GENESIS_TELEGRAM_CHAT_ID
        ? {
            botToken: process.env.GENESIS_TELEGRAM_BOT_TOKEN,
            chatId: process.env.GENESIS_TELEGRAM_CHAT_ID,
          }
        : undefined,
      discord: process.env.GENESIS_DISCORD_WEBHOOK
        ? { webhookUrl: process.env.GENESIS_DISCORD_WEBHOOK }
        : undefined,
      slack: process.env.GENESIS_SLACK_WEBHOOK
        ? { webhookUrl: process.env.GENESIS_SLACK_WEBHOOK }
        : undefined,
      custom: process.env.GENESIS_ALERT_WEBHOOK
        ? { webhookUrl: process.env.GENESIS_ALERT_WEBHOOK }
        : undefined,
    });
  }

  /**
   * Send an alert.
   */
  async send(alert: Omit<Alert, 'timestamp'>): Promise<boolean> {
    if (!this.config.enabled) return false;

    const fullAlert: Alert = {
      ...alert,
      timestamp: Date.now(),
    };

    // Check level threshold
    if (LEVEL_PRIORITY[alert.level] < LEVEL_PRIORITY[this.config.minLevel]) {
      return false;
    }

    // Rate limiting
    const now = Date.now();
    if (now - this.lastAlertTime < (this.config.rateLimitMs ?? 1000)) {
      console.log('[Alerts] Rate limited, skipping:', alert.title);
      return false;
    }
    this.lastAlertTime = now;

    // Store in history
    this.alertHistory.push(fullAlert);
    if (this.alertHistory.length > this.maxHistory) {
      this.alertHistory.shift();
    }

    // Send to all configured channels
    const promises: Promise<boolean>[] = [];

    if (this.config.telegram) {
      promises.push(this.sendTelegram(fullAlert));
    }
    if (this.config.discord) {
      promises.push(this.sendDiscord(fullAlert));
    }
    if (this.config.slack) {
      promises.push(this.sendSlack(fullAlert));
    }
    if (this.config.custom) {
      promises.push(this.sendCustomWebhook(fullAlert));
    }

    if (promises.length === 0) {
      console.log(`[Alerts] No channels configured. ${alert.level.toUpperCase()}: ${alert.title}`);
      return false;
    }

    const results = await Promise.all(promises);
    return results.some(r => r);
  }

  /**
   * Convenience methods for different alert levels.
   */
  async info(title: string, message: string, metadata?: Record<string, unknown>): Promise<boolean> {
    return this.send({ level: 'info', title, message, metadata });
  }

  async success(title: string, message: string, metadata?: Record<string, unknown>): Promise<boolean> {
    return this.send({ level: 'success', title, message, metadata });
  }

  async warning(title: string, message: string, metadata?: Record<string, unknown>): Promise<boolean> {
    return this.send({ level: 'warning', title, message, metadata });
  }

  async error(title: string, message: string, metadata?: Record<string, unknown>): Promise<boolean> {
    return this.send({ level: 'error', title, message, metadata });
  }

  /**
   * Get alert history.
   */
  getHistory(): Alert[] {
    return [...this.alertHistory];
  }

  /**
   * Check if any channel is configured.
   */
  isConfigured(): boolean {
    return !!(
      this.config.telegram ||
      this.config.discord ||
      this.config.slack ||
      this.config.custom
    );
  }

  private async sendTelegram(alert: Alert): Promise<boolean> {
    if (!this.config.telegram) return false;

    try {
      const emoji = LEVEL_EMOJI[alert.level];
      const text = `[${emoji}] *${this.escapeMarkdown(alert.title)}*\n\n${this.escapeMarkdown(alert.message)}`;

      const response = await fetch(
        `https://api.telegram.org/bot${this.config.telegram.botToken}/sendMessage`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: this.config.telegram.chatId,
            text,
            parse_mode: 'MarkdownV2',
          }),
        }
      );

      if (!response.ok) {
        console.warn('[Alerts] Telegram send failed:', await response.text());
        return false;
      }

      return true;
    } catch (error) {
      console.warn('[Alerts] Telegram error:', error);
      return false;
    }
  }

  private async sendDiscord(alert: Alert): Promise<boolean> {
    if (!this.config.discord) return false;

    try {
      const colors: Record<AlertLevel, number> = {
        info: 0x3498db,     // Blue
        success: 0x2ecc71,  // Green
        warning: 0xf39c12,  // Orange
        error: 0xe74c3c,    // Red
      };

      const response = await fetch(this.config.discord.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          embeds: [{
            title: alert.title,
            description: alert.message,
            color: colors[alert.level],
            timestamp: new Date(alert.timestamp).toISOString(),
            footer: { text: 'Genesis Economy' },
          }],
        }),
      });

      if (!response.ok) {
        console.warn('[Alerts] Discord send failed:', response.status);
        return false;
      }

      return true;
    } catch (error) {
      console.warn('[Alerts] Discord error:', error);
      return false;
    }
  }

  private async sendSlack(alert: Alert): Promise<boolean> {
    if (!this.config.slack) return false;

    try {
      const emoji: Record<AlertLevel, string> = {
        info: ':information_source:',
        success: ':white_check_mark:',
        warning: ':warning:',
        error: ':x:',
      };

      const response = await fetch(this.config.slack.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          blocks: [
            {
              type: 'header',
              text: {
                type: 'plain_text',
                text: `${emoji[alert.level]} ${alert.title}`,
              },
            },
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: alert.message,
              },
            },
            {
              type: 'context',
              elements: [{
                type: 'mrkdwn',
                text: `Genesis Economy | ${new Date(alert.timestamp).toISOString()}`,
              }],
            },
          ],
        }),
      });

      if (!response.ok) {
        console.warn('[Alerts] Slack send failed:', response.status);
        return false;
      }

      return true;
    } catch (error) {
      console.warn('[Alerts] Slack error:', error);
      return false;
    }
  }

  private async sendCustomWebhook(alert: Alert): Promise<boolean> {
    if (!this.config.custom) return false;

    try {
      const response = await fetch(this.config.custom.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...this.config.custom.headers,
        },
        body: JSON.stringify({
          level: alert.level,
          title: alert.title,
          message: alert.message,
          timestamp: alert.timestamp,
          metadata: alert.metadata,
          source: 'genesis-economy',
        }),
      });

      if (!response.ok) {
        console.warn('[Alerts] Custom webhook failed:', response.status);
        return false;
      }

      return true;
    } catch (error) {
      console.warn('[Alerts] Custom webhook error:', error);
      return false;
    }
  }

  private escapeMarkdown(text: string): string {
    // Escape special characters for Telegram MarkdownV2
    return text.replace(/[_*[\]()~`>#+=|{}.!-]/g, '\\$&');
  }
}

// Singleton
let alertInstance: AlertSystem | null = null;

export function getAlertSystem(config?: Partial<AlertConfig>): AlertSystem {
  if (!alertInstance) {
    alertInstance = config ? new AlertSystem(config) : AlertSystem.fromEnv();
  }
  return alertInstance;
}

export function resetAlertSystem(): void {
  alertInstance = null;
}

// ============================================================================
// Pre-built Alert Handlers
// ============================================================================

import type { BalanceChange } from './balance-monitor.js';
import type { RevenueEvent } from './revenue-tracker.js';

/**
 * Create a balance change alert handler.
 */
export function createBalanceAlertHandler(
  alerts: AlertSystem,
  thresholdUSDC: number = 1.0
): (change: BalanceChange) => void {
  return (change: BalanceChange) => {
    const usdcChange = Number(change.usdcDelta) / 1e6;
    const absChange = Math.abs(usdcChange);

    if (absChange < thresholdUSDC) return;

    const level: AlertLevel = usdcChange > 0 ? 'success' : 'warning';
    const direction = usdcChange > 0 ? 'increased' : 'decreased';

    alerts.send({
      level,
      title: `Balance ${direction}`,
      message: `USDC balance ${direction} by $${absChange.toFixed(2)}\n` +
               `New balance: $${change.newBalance.usdcFormatted} USDC`,
      metadata: {
        oldBalance: change.oldBalance.usdcFormatted,
        newBalance: change.newBalance.usdcFormatted,
        change: usdcChange,
      },
    });
  };
}

/**
 * Create a revenue event alert handler.
 */
export function createRevenueAlertHandler(
  alerts: AlertSystem,
  thresholdUSD: number = 0.10
): (event: RevenueEvent) => void {
  return (event: RevenueEvent) => {
    if (event.amount < thresholdUSD) return;

    alerts.send({
      level: 'success',
      title: 'Revenue Earned',
      message: `+$${event.amount.toFixed(4)} from ${event.source}\n` +
               (event.txHash ? `Tx: ${event.txHash.slice(0, 10)}...` : ''),
      metadata: {
        source: event.source,
        amount: event.amount,
        txHash: event.txHash,
      },
    });
  };
}
