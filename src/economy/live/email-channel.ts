/**
 * Email Channel for Genesis Alerts
 *
 * Sends notifications via email using Nodemailer.
 * Supports Gmail SMTP, Resend, SendGrid, or custom SMTP.
 *
 * Configuration via env vars:
 * - GENESIS_EMAIL_PROVIDER: 'gmail' | 'resend' | 'sendgrid' | 'smtp'
 * - GENESIS_EMAIL_FROM: sender email address
 * - GENESIS_EMAIL_TO: recipient email(s), comma-separated
 *
 * Gmail SMTP:
 * - GMAIL_APP_PASSWORD: Gmail App Password (not regular password)
 *
 * Resend:
 * - RESEND_API_KEY: Resend API key
 *
 * SendGrid:
 * - SENDGRID_API_KEY: SendGrid API key
 *
 * Custom SMTP:
 * - SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS
 */

import { createTransport, type Transporter } from 'nodemailer';
import type { Alert, AlertLevel } from './alerts.js';

export type EmailProvider = 'gmail' | 'resend' | 'sendgrid' | 'smtp';

export interface EmailConfig {
  provider: EmailProvider;
  from: string;
  to: string[];  // Can be multiple recipients
  // Gmail
  gmailAppPassword?: string;
  // Resend
  resendApiKey?: string;
  // SendGrid
  sendgridApiKey?: string;
  // Custom SMTP
  smtp?: {
    host: string;
    port: number;
    user: string;
    pass: string;
    secure?: boolean;
  };
}

const LEVEL_COLORS: Record<AlertLevel, string> = {
  info: '#3498db',
  success: '#27ae60',
  warning: '#f39c12',
  error: '#e74c3c',
};

const LEVEL_LABELS: Record<AlertLevel, string> = {
  info: 'Info',
  success: 'Success',
  warning: 'Warning',
  error: 'Error',
};

export class EmailChannel {
  private transporter: Transporter | null = null;
  private config: EmailConfig;
  private initialized = false;

  constructor(config: EmailConfig) {
    this.config = config;
  }

  /**
   * Create EmailChannel from environment variables
   */
  static fromEnv(): EmailChannel | null {
    const provider = process.env.GENESIS_EMAIL_PROVIDER as EmailProvider;
    const from = process.env.GENESIS_EMAIL_FROM;
    const to = process.env.GENESIS_EMAIL_TO;

    if (!provider || !from || !to) {
      return null;
    }

    const config: EmailConfig = {
      provider,
      from,
      to: to.split(',').map(e => e.trim()),
    };

    switch (provider) {
      case 'gmail':
        config.gmailAppPassword = process.env.GMAIL_APP_PASSWORD;
        if (!config.gmailAppPassword) return null;
        break;
      case 'resend':
        config.resendApiKey = process.env.RESEND_API_KEY;
        if (!config.resendApiKey) return null;
        break;
      case 'sendgrid':
        config.sendgridApiKey = process.env.SENDGRID_API_KEY;
        if (!config.sendgridApiKey) return null;
        break;
      case 'smtp':
        if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
          return null;
        }
        config.smtp = {
          host: process.env.SMTP_HOST,
          port: parseInt(process.env.SMTP_PORT || '587', 10),
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
          secure: process.env.SMTP_SECURE === 'true',
        };
        break;
    }

    return new EmailChannel(config);
  }

  /**
   * Initialize the email transporter
   */
  private async init(): Promise<boolean> {
    if (this.initialized) return !!this.transporter;

    try {
      switch (this.config.provider) {
        case 'gmail':
          this.transporter = createTransport({
            service: 'gmail',
            auth: {
              user: this.config.from,
              pass: this.config.gmailAppPassword,
            },
          });
          break;

        case 'resend':
          // Resend uses their own SMTP
          this.transporter = createTransport({
            host: 'smtp.resend.com',
            port: 465,
            secure: true,
            auth: {
              user: 'resend',
              pass: this.config.resendApiKey,
            },
          });
          break;

        case 'sendgrid':
          this.transporter = createTransport({
            host: 'smtp.sendgrid.net',
            port: 465,
            secure: true,
            auth: {
              user: 'apikey',
              pass: this.config.sendgridApiKey,
            },
          });
          break;

        case 'smtp':
          if (!this.config.smtp) throw new Error('SMTP config missing');
          this.transporter = createTransport({
            host: this.config.smtp.host,
            port: this.config.smtp.port,
            secure: this.config.smtp.secure ?? false,
            auth: {
              user: this.config.smtp.user,
              pass: this.config.smtp.pass,
            },
          });
          break;
      }

      this.initialized = true;
      return true;
    } catch (error) {
      console.error('[EmailChannel] Init failed:', error);
      return false;
    }
  }

  /**
   * Send an alert via email
   */
  async send(alert: Alert): Promise<boolean> {
    if (!await this.init()) return false;
    if (!this.transporter) return false;

    const color = LEVEL_COLORS[alert.level];
    const label = LEVEL_LABELS[alert.level];
    const timestamp = new Date(alert.timestamp).toISOString();

    const html = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header {
      background: ${color};
      color: white;
      padding: 15px 20px;
      border-radius: 8px 8px 0 0;
    }
    .body {
      background: #f9f9f9;
      padding: 20px;
      border: 1px solid #ddd;
      border-top: none;
      border-radius: 0 0 8px 8px;
    }
    .badge {
      display: inline-block;
      background: rgba(255,255,255,0.2);
      padding: 3px 8px;
      border-radius: 4px;
      font-size: 12px;
      margin-right: 8px;
    }
    .message { margin-top: 15px; line-height: 1.6; }
    .metadata {
      margin-top: 15px;
      padding-top: 15px;
      border-top: 1px solid #ddd;
      font-size: 12px;
      color: #666;
    }
    .footer { margin-top: 20px; font-size: 11px; color: #999; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <span class="badge">${label.toUpperCase()}</span>
      <strong>${this.escapeHtml(alert.title)}</strong>
    </div>
    <div class="body">
      <div class="message">${this.escapeHtml(alert.message).replace(/\n/g, '<br>')}</div>
      ${alert.metadata ? `
        <div class="metadata">
          ${Object.entries(alert.metadata)
            .map(([k, v]) => `<strong>${k}:</strong> ${this.escapeHtml(String(v))}`)
            .join(' | ')}
        </div>
      ` : ''}
    </div>
    <div class="footer">
      Genesis Autonomous AI | ${timestamp}
    </div>
  </div>
</body>
</html>`;

    const text = `[${label}] ${alert.title}\n\n${alert.message}\n\n---\nGenesis | ${timestamp}`;

    try {
      await this.transporter.sendMail({
        from: this.config.from,
        to: this.config.to.join(', '),
        subject: `[Genesis ${label}] ${alert.title}`,
        text,
        html,
      });

      console.log(`[EmailChannel] Sent: ${alert.title}`);
      return true;
    } catch (error) {
      console.error('[EmailChannel] Send failed:', error);
      return false;
    }
  }

  /**
   * Send a simple notification email
   */
  async notify(subject: string, message: string): Promise<boolean> {
    return this.send({
      level: 'info',
      title: subject,
      message,
      timestamp: Date.now(),
    });
  }

  /**
   * Send revenue notification
   */
  async notifyRevenue(amount: number, source: string, details?: Record<string, unknown>): Promise<boolean> {
    return this.send({
      level: 'success',
      title: `Revenue: $${amount.toFixed(2)}`,
      message: `Received $${amount.toFixed(2)} from ${source}`,
      timestamp: Date.now(),
      metadata: details,
    });
  }

  /**
   * Send PR status notification
   */
  async notifyPRStatus(
    repo: string,
    prUrl: string,
    status: 'merged' | 'closed' | 'changes_requested',
    bountyValue?: number
  ): Promise<boolean> {
    const level: AlertLevel = status === 'merged' ? 'success' : status === 'closed' ? 'error' : 'warning';
    const statusText = {
      merged: 'MERGED',
      closed: 'Closed',
      changes_requested: 'Changes Requested',
    }[status];

    return this.send({
      level,
      title: `PR ${statusText}: ${repo}`,
      message: `Pull request ${status === 'merged' ? 'was merged' : status === 'closed' ? 'was closed' : 'needs changes'}!${bountyValue ? `\n\nBounty value: $${bountyValue}` : ''}\n\n${prUrl}`,
      timestamp: Date.now(),
      metadata: { repo, status, prUrl, bountyValue },
    });
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}

// Singleton
let emailChannel: EmailChannel | null = null;

export function getEmailChannel(): EmailChannel | null {
  if (emailChannel === undefined) {
    emailChannel = EmailChannel.fromEnv();
  }
  return emailChannel;
}

export function setEmailChannel(channel: EmailChannel | null): void {
  emailChannel = channel;
}
