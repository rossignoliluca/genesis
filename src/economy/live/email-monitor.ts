/**
 * Email Monitor for Genesis
 *
 * Monitors inbox for important notifications:
 * - GitHub PR updates (merged, closed, changes requested)
 * - Bounty platform notifications
 * - Payment confirmations
 *
 * Uses IMAP to read emails. For Gmail, requires:
 * - IMAP enabled in Gmail settings
 * - Gmail App Password (not regular password)
 *
 * Configuration via env vars:
 * - GENESIS_IMAP_HOST: IMAP server (default: imap.gmail.com)
 * - GENESIS_IMAP_PORT: IMAP port (default: 993)
 * - GENESIS_IMAP_USER: Email address
 * - GENESIS_IMAP_PASS: Password or App Password
 */

import Imap from 'imap';
import { simpleParser, type ParsedMail } from 'mailparser';
import { EventEmitter } from 'events';
import type { Readable } from 'stream';

export interface EmailNotification {
  type: 'pr_merged' | 'pr_closed' | 'pr_changes' | 'pr_comment' | 'bounty_paid' | 'bounty_update' | 'unknown';
  subject: string;
  from: string;
  date: Date;
  repo?: string;
  prNumber?: number;
  prUrl?: string;
  amount?: number;
  rawText?: string;
}

export interface EmailMonitorConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  tls: boolean;
  mailbox: string;
  pollIntervalMs: number;
  markAsRead: boolean;
}

const DEFAULT_CONFIG: Partial<EmailMonitorConfig> = {
  host: 'imap.gmail.com',
  port: 993,
  tls: true,
  mailbox: 'INBOX',
  pollIntervalMs: 60000,  // 1 minute
  markAsRead: true,
};

export class EmailMonitor extends EventEmitter {
  private config: EmailMonitorConfig;
  private imap: Imap | null = null;
  private pollTimer: NodeJS.Timeout | null = null;
  private lastCheckUid: number = 0;
  private running = false;

  constructor(config: Partial<EmailMonitorConfig>) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config } as EmailMonitorConfig;
  }

  /**
   * Create EmailMonitor from environment variables
   */
  static fromEnv(): EmailMonitor | null {
    const user = process.env.GENESIS_IMAP_USER;
    const password = process.env.GENESIS_IMAP_PASS;

    if (!user || !password) {
      return null;
    }

    return new EmailMonitor({
      host: process.env.GENESIS_IMAP_HOST || 'imap.gmail.com',
      port: parseInt(process.env.GENESIS_IMAP_PORT || '993', 10),
      user,
      password,
      pollIntervalMs: parseInt(process.env.GENESIS_EMAIL_POLL_MS || '60000', 10),
    });
  }

  /**
   * Start monitoring inbox
   */
  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;

    console.log('[EmailMonitor] Starting...');

    // Initial check
    await this.checkInbox();

    // Set up polling
    this.pollTimer = setInterval(() => {
      this.checkInbox().catch(err => {
        console.error('[EmailMonitor] Poll error:', err.message);
      });
    }, this.config.pollIntervalMs);

    console.log(`[EmailMonitor] Polling every ${this.config.pollIntervalMs / 1000}s`);
  }

  /**
   * Stop monitoring
   */
  stop(): void {
    this.running = false;
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    if (this.imap) {
      this.imap.end();
      this.imap = null;
    }
    console.log('[EmailMonitor] Stopped');
  }

  /**
   * Check inbox for new emails
   */
  async checkInbox(): Promise<EmailNotification[]> {
    return new Promise((resolve, reject) => {
      const notifications: EmailNotification[] = [];

      const imap = new Imap({
        user: this.config.user,
        password: this.config.password,
        host: this.config.host,
        port: this.config.port,
        tls: this.config.tls,
        tlsOptions: { rejectUnauthorized: false },
      });

      imap.once('ready', () => {
        imap.openBox(this.config.mailbox, false, (err, box) => {
          if (err) {
            imap.end();
            return reject(err);
          }

          // Search for unread emails from GitHub or bounty platforms
          const searchCriteria = [
            'UNSEEN',
            ['OR',
              ['FROM', 'notifications@github.com'],
              ['FROM', 'noreply@github.com'],
              ['FROM', 'algora.io'],
              ['FROM', 'gitcoin.co'],
              ['FROM', 'dework.xyz'],
              ['FROM', 'stripe.com'],
            ],
          ];

          imap.search(searchCriteria, (err, uids) => {
            if (err) {
              imap.end();
              return reject(err);
            }

            if (!uids || uids.length === 0) {
              imap.end();
              return resolve([]);
            }

            console.log(`[EmailMonitor] Found ${uids.length} new emails`);

            const fetch = imap.fetch(uids, { bodies: '', markSeen: this.config.markAsRead });
            const emailPromises: Promise<EmailNotification>[] = [];

            fetch.on('message', (msg) => {
              emailPromises.push(new Promise((resolveEmail) => {
                msg.on('body', (stream) => {
                  simpleParser(stream as unknown as Readable, (err, mail) => {
                    if (err) {
                      resolveEmail({ type: 'unknown', subject: 'Parse error', from: '', date: new Date() });
                      return;
                    }
                    const notification = this.parseEmail(mail);
                    resolveEmail(notification);
                  });
                });
              }));
            });

            fetch.once('error', (err) => {
              console.error('[EmailMonitor] Fetch error:', err);
            });

            fetch.once('end', async () => {
              const results = await Promise.all(emailPromises);
              for (const notif of results) {
                if (notif.type !== 'unknown') {
                  notifications.push(notif);
                  this.emit('notification', notif);
                }
              }
              imap.end();
              resolve(notifications);
            });
          });
        });
      });

      imap.once('error', (err: Error) => {
        console.error('[EmailMonitor] IMAP error:', err.message);
        reject(err);
      });

      imap.connect();
    });
  }

  /**
   * Parse email into notification
   */
  private parseEmail(mail: ParsedMail): EmailNotification {
    const subject = mail.subject || '';
    const from = mail.from?.text || '';
    const text = mail.text || '';
    const date = mail.date || new Date();

    const notification: EmailNotification = {
      type: 'unknown',
      subject,
      from,
      date,
      rawText: text.slice(0, 500),
    };

    // GitHub notifications
    if (from.includes('github.com')) {
      // Extract repo and PR number from subject
      // Format: "Re: [owner/repo] Title (#123)"
      const prMatch = subject.match(/\[([^\]]+)\].*#(\d+)/);
      if (prMatch) {
        notification.repo = prMatch[1];
        notification.prNumber = parseInt(prMatch[2], 10);
        notification.prUrl = `https://github.com/${prMatch[1]}/pull/${prMatch[2]}`;
      }

      // Determine notification type
      if (subject.includes('merged') || text.includes('Merged #') || text.includes('was merged')) {
        notification.type = 'pr_merged';
      } else if (subject.includes('closed') || text.includes('Closed #') || text.includes('was closed')) {
        notification.type = 'pr_closed';
      } else if (text.includes('requested changes') || text.includes('Changes requested')) {
        notification.type = 'pr_changes';
      } else if (text.includes('commented') || text.includes('left a comment')) {
        notification.type = 'pr_comment';
      }
    }

    // Bounty platform notifications
    else if (from.includes('algora') || from.includes('gitcoin') || from.includes('dework')) {
      if (text.includes('paid') || text.includes('payment') || text.includes('reward')) {
        notification.type = 'bounty_paid';
        // Try to extract amount
        const amountMatch = text.match(/\$?([\d,]+(?:\.\d{2})?)/);
        if (amountMatch) {
          notification.amount = parseFloat(amountMatch[1].replace(',', ''));
        }
      } else {
        notification.type = 'bounty_update';
      }
    }

    // Stripe notifications
    else if (from.includes('stripe.com')) {
      if (text.includes('payment') || text.includes('received')) {
        notification.type = 'bounty_paid';
        const amountMatch = text.match(/\$?([\d,]+(?:\.\d{2})?)/);
        if (amountMatch) {
          notification.amount = parseFloat(amountMatch[1].replace(',', ''));
        }
      }
    }

    return notification;
  }
}

// Singleton
let emailMonitor: EmailMonitor | null = null;

export function getEmailMonitor(): EmailMonitor | null {
  if (emailMonitor === undefined) {
    emailMonitor = EmailMonitor.fromEnv();
  }
  return emailMonitor;
}

export function setEmailMonitor(monitor: EmailMonitor | null): void {
  emailMonitor = monitor;
}
