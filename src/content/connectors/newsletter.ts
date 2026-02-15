/**
 * Genesis v33 - Newsletter Platform Connectors (Item 24)
 *
 * Integrates Beehiiv and Buttondown newsletter platforms for
 * automated distribution of weekly market strategy reports.
 *
 * Follows the same connector pattern as Twitter/LinkedIn/Bluesky connectors.
 * Wired into strategy-wiring.ts publishMarketBrief() pipeline.
 *
 * Env vars:
 *   BEEHIIV_API_KEY, BEEHIIV_PUBLICATION_ID  — for Beehiiv
 *   BUTTONDOWN_API_TOKEN                     — for Buttondown
 *   NEWSLETTER_PLATFORM                      — 'beehiiv' | 'buttondown' (default: 'beehiiv')
 */

// ============================================================================
// Types
// ============================================================================

export interface NewsletterConfig {
  platform: 'beehiiv' | 'buttondown';
  apiKey: string;
  publicationId?: string; // Beehiiv only
}

export interface NewsletterSendOptions {
  subject: string;
  htmlContent: string;
  textContent?: string;
  scheduledAt?: Date;
  tags?: string[];
}

export interface NewsletterResult {
  success: boolean;
  emailId?: string;
  url?: string;
  error?: string;
  platform: string;
  subscriberCount?: number;
}

export interface SubscriberInfo {
  total: number;
  active: number;
  unsubscribed: number;
}

// ============================================================================
// Beehiiv Connector
// ============================================================================

export class BeehiivConnector {
  private apiKey: string;
  private publicationId: string;
  private baseUrl = 'https://api.beehiiv.com/v2';

  constructor(apiKey: string, publicationId: string) {
    this.apiKey = apiKey;
    this.publicationId = publicationId;
  }

  async sendNewsletter(options: NewsletterSendOptions): Promise<NewsletterResult> {
    try {
      const body: any = {
        content_html: options.htmlContent,
        subject: options.subject,
        status: options.scheduledAt ? 'scheduled' : 'sending',
      };

      if (options.textContent) {
        body.content_text = options.textContent;
      }

      if (options.scheduledAt) {
        body.scheduled_at = options.scheduledAt.toISOString();
      }

      if (options.tags && options.tags.length > 0) {
        body.custom_tags = options.tags;
      }

      const response = await fetch(
        `${this.baseUrl}/publications/${this.publicationId}/posts`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        },
      );

      if (!response.ok) {
        const errBody = await response.text();
        return {
          success: false,
          error: `Beehiiv API error ${response.status}: ${errBody}`,
          platform: 'beehiiv',
        };
      }

      const data = await response.json();

      return {
        success: true,
        emailId: data.data?.id,
        url: data.data?.web_url,
        platform: 'beehiiv',
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        platform: 'beehiiv',
      };
    }
  }

  async getSubscriberCount(): Promise<SubscriberInfo> {
    try {
      const response = await fetch(
        `${this.baseUrl}/publications/${this.publicationId}/subscriptions?limit=1`,
        {
          headers: { 'Authorization': `Bearer ${this.apiKey}` },
        },
      );

      if (!response.ok) {
        return { total: 0, active: 0, unsubscribed: 0 };
      }

      const data = await response.json();
      return {
        total: data.total_results || 0,
        active: data.total_results || 0,
        unsubscribed: 0,
      };
    } catch {
      return { total: 0, active: 0, unsubscribed: 0 };
    }
  }

  async addSubscriber(email: string): Promise<boolean> {
    try {
      const response = await fetch(
        `${this.baseUrl}/publications/${this.publicationId}/subscriptions`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ email, reactivate_existing: true }),
        },
      );

      return response.ok;
    } catch {
      return false;
    }
  }

  async healthCheck(): Promise<{ ok: boolean; message: string }> {
    try {
      const response = await fetch(
        `${this.baseUrl}/publications/${this.publicationId}`,
        { headers: { 'Authorization': `Bearer ${this.apiKey}` } },
      );

      return response.ok
        ? { ok: true, message: 'Beehiiv connected' }
        : { ok: false, message: `HTTP ${response.status}` };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : 'Connection failed' };
    }
  }
}

// ============================================================================
// Buttondown Connector
// ============================================================================

export class ButtondownConnector {
  private apiToken: string;
  private baseUrl = 'https://api.buttondown.email/v1';

  constructor(apiToken: string) {
    this.apiToken = apiToken;
  }

  async sendNewsletter(options: NewsletterSendOptions): Promise<NewsletterResult> {
    try {
      const body: any = {
        subject: options.subject,
        body: options.htmlContent,
        status: options.scheduledAt ? 'scheduled' : 'about_to_send',
      };

      if (options.scheduledAt) {
        body.publish_date = options.scheduledAt.toISOString();
      }

      if (options.tags && options.tags.length > 0) {
        body.tags = options.tags;
      }

      const response = await fetch(`${this.baseUrl}/emails`, {
        method: 'POST',
        headers: {
          'Authorization': `Token ${this.apiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errBody = await response.text();
        return {
          success: false,
          error: `Buttondown API error ${response.status}: ${errBody}`,
          platform: 'buttondown',
        };
      }

      const data = await response.json();

      return {
        success: true,
        emailId: data.id,
        url: data.absolute_url,
        platform: 'buttondown',
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        platform: 'buttondown',
      };
    }
  }

  async getSubscriberCount(): Promise<SubscriberInfo> {
    try {
      const response = await fetch(`${this.baseUrl}/subscribers?type=regular&page_size=1`, {
        headers: { 'Authorization': `Token ${this.apiToken}` },
      });

      if (!response.ok) {
        return { total: 0, active: 0, unsubscribed: 0 };
      }

      const data = await response.json();
      return {
        total: data.count || 0,
        active: data.count || 0,
        unsubscribed: 0,
      };
    } catch {
      return { total: 0, active: 0, unsubscribed: 0 };
    }
  }

  async addSubscriber(email: string): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/subscribers`, {
        method: 'POST',
        headers: {
          'Authorization': `Token ${this.apiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async healthCheck(): Promise<{ ok: boolean; message: string }> {
    try {
      const response = await fetch(`${this.baseUrl}/ping`, {
        headers: { 'Authorization': `Token ${this.apiToken}` },
      });
      return response.ok
        ? { ok: true, message: 'Buttondown connected' }
        : { ok: false, message: `HTTP ${response.status}` };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : 'Connection failed' };
    }
  }
}

// ============================================================================
// Unified Newsletter Interface
// ============================================================================

export interface NewsletterConnector {
  sendNewsletter(options: NewsletterSendOptions): Promise<NewsletterResult>;
  getSubscriberCount(): Promise<SubscriberInfo>;
  addSubscriber(email: string): Promise<boolean>;
  healthCheck(): Promise<{ ok: boolean; message: string }>;
}

// ============================================================================
// Factory
// ============================================================================

let newsletterInstance: NewsletterConnector | null = null;

/**
 * Get or create a newsletter connector based on environment configuration.
 * Returns null if no newsletter platform is configured.
 */
export function getNewsletterConnector(): NewsletterConnector | null {
  if (newsletterInstance) return newsletterInstance;

  const platform = process.env.NEWSLETTER_PLATFORM || 'beehiiv';

  if (platform === 'beehiiv') {
    const apiKey = process.env.BEEHIIV_API_KEY;
    const pubId = process.env.BEEHIIV_PUBLICATION_ID;
    if (apiKey && pubId) {
      newsletterInstance = new BeehiivConnector(apiKey, pubId);
      return newsletterInstance;
    }
  }

  if (platform === 'buttondown') {
    const token = process.env.BUTTONDOWN_API_TOKEN;
    if (token) {
      newsletterInstance = new ButtondownConnector(token);
      return newsletterInstance;
    }
  }

  return null;
}

/**
 * Build newsletter-friendly HTML from a market brief summary.
 * Optimized for email rendering (inline styles, table layout, max 600px).
 */
export function buildNewsletterEmail(brief: {
  week: string;
  date: string;
  sentiment: { overall: string; score: number };
  themes: string[];
  narratives: Array<{ title: string; summary: string; conviction: string }>;
  positioning: Array<{ assetClass: string; position: string; conviction: string; rationale: string }>;
  risks: string[];
  opportunities: string[];
}): string {
  const sentimentColor = brief.sentiment.overall === 'bullish' ? '#2E865F'
    : brief.sentiment.overall === 'bearish' ? '#CC0000' : '#B8860B';

  const narrativesHtml = brief.narratives.map(n => `
    <tr>
      <td style="padding: 12px 0; border-bottom: 1px solid #eee;">
        <strong style="color: #0C2340;">${escapeHtml(n.title)}</strong>
        <span style="display: inline-block; background: ${sentimentColor}22; color: ${sentimentColor}; font-size: 10px; padding: 1px 6px; border-radius: 2px; margin-left: 8px;">${n.conviction}</span>
        <br><span style="font-size: 13px; color: #444;">${escapeHtml(n.summary)}</span>
      </td>
    </tr>`).join('');

  const positioningHtml = brief.positioning.map(p => {
    const posColor = p.position === 'long' ? '#2E865F' : p.position === 'short' ? '#CC0000' : '#B8860B';
    return `<tr>
      <td style="padding: 6px 12px; border-bottom: 1px solid #eee; font-size: 13px;">${escapeHtml(p.assetClass)}</td>
      <td style="padding: 6px 12px; border-bottom: 1px solid #eee; font-size: 13px; color: ${posColor}; font-weight: bold;">${p.position.toUpperCase()}</td>
      <td style="padding: 6px 12px; border-bottom: 1px solid #eee; font-size: 13px;">${p.conviction}</td>
      <td style="padding: 6px 12px; border-bottom: 1px solid #eee; font-size: 12px; color: #666;">${escapeHtml(p.rationale)}</td>
    </tr>`;
  }).join('');

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin: 0; padding: 0; background: #f5f5f5;">
<table cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; margin: 0 auto; background: #ffffff; font-family: Georgia, serif; color: #1a1a1a; line-height: 1.6;">
  <!-- Header -->
  <tr><td style="height: 3px; background: #E86C00;"></td></tr>
  <tr>
    <td style="padding: 24px 24px 16px;">
      <table width="100%"><tr>
        <td><span style="font-size: 16px; letter-spacing: 2px; color: #0C2340;">ROSSIGNOLI & PARTNERS</span></td>
        <td style="text-align: right; font-size: 12px; color: #999;">${escapeHtml(brief.week)} | ${escapeHtml(brief.date)}</td>
      </tr></table>
      <p style="margin: 4px 0 0; font-size: 11px; color: #999; letter-spacing: 1px; text-transform: uppercase;">Weekly Market Strategy</p>
    </td>
  </tr>

  <!-- Sentiment -->
  <tr>
    <td style="padding: 0 24px 16px;">
      <span style="display: inline-block; padding: 4px 12px; background: ${sentimentColor}15; color: ${sentimentColor}; border-left: 3px solid ${sentimentColor}; font-size: 13px;">
        Sentiment: <strong>${brief.sentiment.overall.toUpperCase()}</strong> (${(brief.sentiment.score * 100).toFixed(0)}%)
      </span>
      <span style="font-size: 12px; color: #999; margin-left: 12px;">${brief.themes.slice(0, 4).join(' | ')}</span>
    </td>
  </tr>

  <!-- Narratives -->
  <tr>
    <td style="padding: 0 24px 20px;">
      <p style="font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #E86C00; margin-bottom: 8px;">Key Narratives</p>
      <table width="100%" cellpadding="0" cellspacing="0">${narrativesHtml}</table>
    </td>
  </tr>

  <!-- Positioning -->
  <tr>
    <td style="padding: 0 24px 20px;">
      <p style="font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #E86C00; margin-bottom: 8px;">Positioning</p>
      <table width="100%" cellpadding="0" cellspacing="0" style="border: 1px solid #eee; border-radius: 4px;">
        <tr style="background: #0C2340; color: white;">
          <th style="padding: 6px 12px; font-size: 10px; text-align: left; letter-spacing: 1px;">ASSET</th>
          <th style="padding: 6px 12px; font-size: 10px; text-align: left;">POSITION</th>
          <th style="padding: 6px 12px; font-size: 10px; text-align: left;">CONVICTION</th>
          <th style="padding: 6px 12px; font-size: 10px; text-align: left;">RATIONALE</th>
        </tr>
        ${positioningHtml}
      </table>
    </td>
  </tr>

  <!-- Risks & Opps -->
  <tr>
    <td style="padding: 0 24px 20px;">
      <table width="100%" cellpadding="0" cellspacing="0"><tr>
        <td width="48%" valign="top">
          <p style="font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #CC0000; margin-bottom: 6px;">Risks</p>
          ${brief.risks.map(r => `<p style="font-size: 12px; padding-left: 10px; border-left: 2px solid #CC0000; margin-bottom: 6px;">${escapeHtml(r)}</p>`).join('')}
        </td>
        <td width="4%"></td>
        <td width="48%" valign="top">
          <p style="font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #2E865F; margin-bottom: 6px;">Opportunities</p>
          ${brief.opportunities.map(o => `<p style="font-size: 12px; padding-left: 10px; border-left: 2px solid #2E865F; margin-bottom: 6px;">${escapeHtml(o)}</p>`).join('')}
        </td>
      </tr></table>
    </td>
  </tr>

  <!-- Footer -->
  <tr>
    <td style="padding: 16px 24px; border-top: 1px solid #eee; font-size: 10px; color: #999; line-height: 1.4; font-family: Helvetica, Arial, sans-serif;">
      This material is for informational purposes only and does not constitute investment advice.
      Past performance is not indicative of future results.<br>
      Via Nassa 21, CH-6900 Lugano | +41 91 922 44 00<br>
      &copy; ${new Date().getFullYear()} Rossignoli & Partners. All rights reserved.
      <br><br>
      <a href="{{unsubscribe_url}}" style="color: #999;">Unsubscribe</a>
    </td>
  </tr>
</table>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
