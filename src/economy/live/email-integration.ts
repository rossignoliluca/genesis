/**
 * Email Integration for Genesis Economy
 *
 * Connects email monitoring to the rest of the system:
 * - Email notifications → PR Pipeline (status updates)
 * - Email notifications → Revenue Tracker (payment confirmations)
 * - Email notifications → Alert System (forward important emails)
 *
 * This creates a complete feedback loop:
 * 1. Genesis submits PR
 * 2. GitHub sends email notification
 * 3. Email monitor detects merge/payment
 * 4. Revenue tracker records the income
 * 5. Alert system notifies user
 */

import { getEmailMonitor, type EmailNotification, type EmailMonitor } from './email-monitor.js';
import { getEmailChannel, type EmailChannel } from './email-channel.js';
import { getRevenueTracker, type RevenueTracker } from './revenue-tracker.js';
import { getAlertSystem, type AlertSystem } from './alerts.js';
import { EventEmitter } from 'events';

export interface EmailIntegrationConfig {
  /** Enable email monitoring (requires IMAP config) */
  monitorEnabled: boolean;
  /** Enable email alerts (requires email channel config) */
  alertsEnabled: boolean;
  /** Auto-record revenue from email payment notifications */
  autoRecordRevenue: boolean;
  /** Forward important emails to alert system */
  forwardToAlerts: boolean;
}

const DEFAULT_CONFIG: EmailIntegrationConfig = {
  monitorEnabled: true,
  alertsEnabled: true,
  autoRecordRevenue: true,
  forwardToAlerts: true,
};

export class EmailIntegration extends EventEmitter {
  private config: EmailIntegrationConfig;
  private monitor: EmailMonitor | null = null;
  private emailChannel: EmailChannel | null = null;
  private revenueTracker: RevenueTracker | null = null;
  private alertSystem: AlertSystem | null = null;
  private running = false;

  constructor(config: Partial<EmailIntegrationConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Initialize email integration
   */
  async init(): Promise<boolean> {
    console.log('[EmailIntegration] Initializing...');

    // Get email monitor
    if (this.config.monitorEnabled) {
      this.monitor = getEmailMonitor();
      if (this.monitor) {
        this.setupMonitorHandlers();
        console.log('[EmailIntegration] Email monitor configured');
      } else {
        console.log('[EmailIntegration] Email monitor not configured (set GENESIS_IMAP_* env vars)');
      }
    }

    // Get email channel for sending
    if (this.config.alertsEnabled) {
      this.emailChannel = getEmailChannel();
      if (this.emailChannel) {
        console.log('[EmailIntegration] Email channel configured');
      } else {
        console.log('[EmailIntegration] Email channel not configured (set GENESIS_EMAIL_* env vars)');
      }
    }

    // Get revenue tracker
    if (this.config.autoRecordRevenue) {
      this.revenueTracker = getRevenueTracker();
      console.log('[EmailIntegration] Revenue tracker connected');
    }

    // Get alert system
    if (this.config.forwardToAlerts) {
      this.alertSystem = getAlertSystem();
      console.log('[EmailIntegration] Alert system connected');
    }

    const hasAnyFeature = !!(this.monitor || this.emailChannel);
    if (!hasAnyFeature) {
      console.log('[EmailIntegration] No email features configured. Set environment variables:');
      console.log('  For sending: GENESIS_EMAIL_PROVIDER, GENESIS_EMAIL_FROM, GENESIS_EMAIL_TO, GMAIL_APP_PASSWORD');
      console.log('  For monitoring: GENESIS_IMAP_USER, GENESIS_IMAP_PASS');
    }

    return hasAnyFeature;
  }

  /**
   * Start email integration
   */
  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;

    if (this.monitor) {
      await this.monitor.start();
    }

    console.log('[EmailIntegration] Started');
  }

  /**
   * Stop email integration
   */
  stop(): void {
    this.running = false;
    if (this.monitor) {
      this.monitor.stop();
    }
    console.log('[EmailIntegration] Stopped');
  }

  /**
   * Set up handlers for email monitor events
   */
  private setupMonitorHandlers(): void {
    if (!this.monitor) return;

    this.monitor.on('notification', async (notif: EmailNotification) => {
      console.log(`[EmailIntegration] Received: ${notif.type} - ${notif.subject}`);

      try {
        await this.handleNotification(notif);
      } catch (error) {
        console.error('[EmailIntegration] Handler error:', error);
      }
    });
  }

  /**
   * Handle email notification
   */
  private async handleNotification(notif: EmailNotification): Promise<void> {
    // Emit event for external handlers
    this.emit('notification', notif);

    switch (notif.type) {
      case 'pr_merged':
        await this.handlePRMerged(notif);
        break;
      case 'pr_closed':
        await this.handlePRClosed(notif);
        break;
      case 'pr_changes':
        await this.handlePRChanges(notif);
        break;
      case 'bounty_paid':
        await this.handleBountyPaid(notif);
        break;
      case 'bounty_update':
        await this.handleBountyUpdate(notif);
        break;
      case 'pr_comment':
        // Just log, don't alert for every comment
        console.log(`[EmailIntegration] PR comment on ${notif.repo}#${notif.prNumber}`);
        break;
    }
  }

  /**
   * Handle PR merged notification
   */
  private async handlePRMerged(notif: EmailNotification): Promise<void> {
    console.log(`[EmailIntegration] PR MERGED: ${notif.repo}#${notif.prNumber}`);

    // Emit for PR pipeline to pick up
    this.emit('pr:merged', {
      repo: notif.repo,
      prNumber: notif.prNumber,
      prUrl: notif.prUrl,
    });

    // Send alert
    if (this.alertSystem && this.config.forwardToAlerts) {
      await this.alertSystem.success(
        'PR Merged!',
        `${notif.repo}#${notif.prNumber} was merged.\n${notif.prUrl || ''}`,
        { repo: notif.repo, prNumber: notif.prNumber }
      );
    }

    // Send email notification
    if (this.emailChannel) {
      await this.emailChannel.notifyPRStatus(
        notif.repo || 'unknown',
        notif.prUrl || '',
        'merged'
      );
    }
  }

  /**
   * Handle PR closed notification
   */
  private async handlePRClosed(notif: EmailNotification): Promise<void> {
    console.log(`[EmailIntegration] PR CLOSED: ${notif.repo}#${notif.prNumber}`);

    this.emit('pr:closed', {
      repo: notif.repo,
      prNumber: notif.prNumber,
      prUrl: notif.prUrl,
    });

    if (this.alertSystem && this.config.forwardToAlerts) {
      await this.alertSystem.warning(
        'PR Closed',
        `${notif.repo}#${notif.prNumber} was closed without merging.\n${notif.prUrl || ''}`,
        { repo: notif.repo, prNumber: notif.prNumber }
      );
    }
  }

  /**
   * Handle PR changes requested notification
   */
  private async handlePRChanges(notif: EmailNotification): Promise<void> {
    console.log(`[EmailIntegration] PR CHANGES REQUESTED: ${notif.repo}#${notif.prNumber}`);

    this.emit('pr:changes_requested', {
      repo: notif.repo,
      prNumber: notif.prNumber,
      prUrl: notif.prUrl,
    });

    if (this.alertSystem && this.config.forwardToAlerts) {
      await this.alertSystem.warning(
        'Changes Requested',
        `${notif.repo}#${notif.prNumber} needs changes.\n${notif.prUrl || ''}\n\nCheck the PR for reviewer feedback.`,
        { repo: notif.repo, prNumber: notif.prNumber }
      );
    }
  }

  /**
   * Handle bounty paid notification
   */
  private async handleBountyPaid(notif: EmailNotification): Promise<void> {
    const amount = notif.amount || 0;
    console.log(`[EmailIntegration] BOUNTY PAID: $${amount}`);

    // Record revenue
    if (this.revenueTracker && this.config.autoRecordRevenue && amount > 0) {
      this.revenueTracker.record({
        source: 'bounty',
        amount,
        currency: 'USD',
        metadata: {
          fromEmail: true,
          subject: notif.subject,
          date: notif.date.toISOString(),
        },
      });
      console.log(`[EmailIntegration] Revenue recorded: $${amount}`);
    }

    this.emit('bounty:paid', { amount, notification: notif });

    if (this.alertSystem && this.config.forwardToAlerts) {
      await this.alertSystem.success(
        'Bounty Payment Received!',
        `$${amount.toFixed(2)} received!\n\n${notif.subject}`,
        { amount, source: 'email' }
      );
    }

    if (this.emailChannel && amount > 0) {
      await this.emailChannel.notifyRevenue(amount, 'bounty', {
        subject: notif.subject,
      });
    }
  }

  /**
   * Handle bounty update notification
   */
  private async handleBountyUpdate(notif: EmailNotification): Promise<void> {
    console.log(`[EmailIntegration] Bounty update: ${notif.subject}`);

    this.emit('bounty:update', { notification: notif });

    // Only alert for important updates
    if (this.alertSystem && this.config.forwardToAlerts) {
      await this.alertSystem.info(
        'Bounty Update',
        notif.subject,
        { rawText: notif.rawText?.slice(0, 200) }
      );
    }
  }

  /**
   * Get integration status
   */
  getStatus(): {
    running: boolean;
    monitorEnabled: boolean;
    emailChannelEnabled: boolean;
    revenueTrackerConnected: boolean;
    alertSystemConnected: boolean;
  } {
    return {
      running: this.running,
      monitorEnabled: !!this.monitor,
      emailChannelEnabled: !!this.emailChannel,
      revenueTrackerConnected: !!this.revenueTracker,
      alertSystemConnected: !!this.alertSystem,
    };
  }
}

// Singleton
let emailIntegration: EmailIntegration | null = null;

export function getEmailIntegration(config?: Partial<EmailIntegrationConfig>): EmailIntegration {
  if (!emailIntegration) {
    emailIntegration = new EmailIntegration(config);
  }
  return emailIntegration;
}

export function resetEmailIntegration(): void {
  if (emailIntegration) {
    emailIntegration.stop();
  }
  emailIntegration = null;
}
