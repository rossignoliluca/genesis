/**
 * Genesis v32 - Computer Use / Vision Integration (Item 17)
 *
 * Integrates Claude's computer use API for browser automation
 * and vision capabilities for screenshot/chart analysis.
 *
 * Uses Playwright MCP for browser interaction and
 * multimodal LLM calls for image understanding.
 */

import { getMCPClient } from '../mcp/index.js';
import type { IMCPClient } from '../mcp/index.js';

// URL safety: block internal/private network access
const BLOCKED_URL_PATTERNS = [
  /^https?:\/\/localhost/i,
  /^https?:\/\/127\./,
  /^https?:\/\/10\./,
  /^https?:\/\/172\.(1[6-9]|2\d|3[01])\./,
  /^https?:\/\/192\.168\./,
  /^https?:\/\/0\./,
  /^https?:\/\/\[::1\]/,
  /^file:/i,
  /^data:/i,
  /^javascript:/i,
];

function validateUrl(url: string): void {
  for (const pattern of BLOCKED_URL_PATTERNS) {
    if (pattern.test(url)) {
      throw new Error(`[ComputerUse] Blocked URL (SSRF protection): ${url}`);
    }
  }
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new Error(`[ComputerUse] Only HTTP/HTTPS URLs allowed: ${url}`);
    }
  } catch (e) {
    if (e instanceof Error && e.message.includes('ComputerUse')) throw e;
    throw new Error(`[ComputerUse] Invalid URL: ${url}`);
  }
}

// ============================================================================
// Types
// ============================================================================

export interface ScreenshotAnalysis {
  description: string;
  elements: UIElement[];
  dataPoints: ExtractedDataPoint[];
  actionSuggestions: string[];
}

export interface UIElement {
  type: 'button' | 'input' | 'chart' | 'table' | 'text' | 'image' | 'link';
  label: string;
  location?: { x: number; y: number; width: number; height: number };
}

export interface ExtractedDataPoint {
  label: string;
  value: string;
  confidence: number;
}

export interface BrowsingAction {
  type: 'navigate' | 'click' | 'type' | 'screenshot' | 'scroll' | 'wait';
  target?: string;
  value?: string;
}

// ============================================================================
// Computer Use Controller
// ============================================================================

export class ComputerUseController {
  private mcp: IMCPClient;

  constructor() {
    this.mcp = getMCPClient();
  }

  /**
   * Take a screenshot and analyze it with vision
   */
  async captureAndAnalyze(url?: string): Promise<ScreenshotAnalysis> {
    // Navigate if URL provided
    if (url) {
      validateUrl(url);
      await this.mcp.call('playwright', 'browser_navigate', { url });
      // Wait for page to load
      await this.mcp.call('playwright', 'browser_wait_for', {
        state: 'networkidle',
        timeout: 10000,
      }).catch((e: Error) => { console.debug('[ComputerUse] Page load timeout:', e?.message); });
    }

    // Take screenshot
    const screenshot = await this.mcp.call('playwright', 'browser_take_screenshot', {});

    // Get page snapshot for accessibility tree
    const snapshot = await this.mcp.call('playwright', 'browser_snapshot', {}).catch(() => null);

    // Analyze screenshot with LLM vision
    const analysis = await this.analyzeScreenshot(screenshot.data, snapshot?.data);

    return analysis;
  }

  /**
   * Execute a sequence of browser actions
   */
  async executeActions(actions: BrowsingAction[]): Promise<string[]> {
    const results: string[] = [];

    for (const action of actions) {
      try {
        switch (action.type) {
          case 'navigate':
            validateUrl(action.target!);
            await this.mcp.call('playwright', 'browser_navigate', { url: action.target });
            results.push(`Navigated to ${action.target}`);
            break;

          case 'click':
            await this.mcp.call('playwright', 'browser_click', { element: action.target });
            results.push(`Clicked ${action.target}`);
            break;

          case 'type':
            await this.mcp.call('playwright', 'browser_fill_form', {
              element: action.target,
              value: action.value,
            });
            results.push(`Typed "${action.value}" into ${action.target}`);
            break;

          case 'screenshot':
            await this.mcp.call('playwright', 'browser_take_screenshot', {});
            results.push('Screenshot captured');
            break;

          case 'scroll':
            await this.mcp.call('playwright', 'browser_evaluate', {
              expression: `window.scrollBy(0, ${action.value || 500})`,
            });
            results.push(`Scrolled ${action.value || 500}px`);
            break;

          case 'wait':
            await new Promise(resolve => setTimeout(resolve, parseInt(action.value || '1000')));
            results.push(`Waited ${action.value || 1000}ms`);
            break;
        }
      } catch (error) {
        results.push(`Failed: ${action.type} - ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    return results;
  }

  /**
   * Extract data from a chart image using vision
   */
  async extractChartData(screenshotBase64: string): Promise<ExtractedDataPoint[]> {
    try {
      const result = await this.mcp.call('openai', 'openai_chat', {
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: `You are a financial data extraction expert. Analyze this chart/image and extract all visible data points.
Return a JSON array: [{"label": "data series or axis label", "value": "numeric value or range", "confidence": 0.0-1.0}]
Be precise with numbers. Include trend directions, axis labels, legends, and any visible annotations.`,
          },
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Extract all data points from this chart:' },
              { type: 'image_url', image_url: { url: `data:image/png;base64,${screenshotBase64}` } },
            ],
          },
        ],
        temperature: 0.1,
        max_tokens: 2048,
      });

      const content = result.data?.choices?.[0]?.message?.content || '[]';
      const match = content.match(/\[[\s\S]*\]/);
      if (match) {
        try {
          return JSON.parse(match[0]);
        } catch {
          // LLM returned malformed JSON
        }
      }
    } catch (error) {
      console.error('[ComputerUse] Chart extraction failed:', error);
    }
    return [];
  }

  // ==========================================================================
  // Internal
  // ==========================================================================

  private async analyzeScreenshot(screenshotData: any, snapshotData: any): Promise<ScreenshotAnalysis> {
    try {
      const messages: any[] = [
        {
          role: 'system',
          content: `Analyze this web page screenshot. Return JSON:
{"description": "page summary", "elements": [{"type": "button|input|chart|table|text|image|link", "label": "description"}], "dataPoints": [{"label": "name", "value": "value", "confidence": 0.9}], "actionSuggestions": ["suggested next action"]}`,
        },
      ];

      // Add screenshot if available as base64
      if (typeof screenshotData === 'string') {
        messages.push({
          role: 'user',
          content: [
            { type: 'text', text: 'Analyze this page:' },
            { type: 'image_url', image_url: { url: `data:image/png;base64,${screenshotData}` } },
          ],
        });
      } else {
        // Fallback to snapshot/accessibility tree
        messages.push({
          role: 'user',
          content: `Analyze this page structure:\n${JSON.stringify(snapshotData || {}).slice(0, 3000)}`,
        });
      }

      const result = await this.mcp.call('openai', 'openai_chat', {
        model: 'gpt-4o',
        messages,
        temperature: 0.2,
        max_tokens: 2048,
      });

      const content = result.data?.choices?.[0]?.message?.content || '{}';
      const match = content.match(/\{[\s\S]*\}/);
      if (match) {
        try {
          return JSON.parse(match[0]);
        } catch {
          // LLM returned malformed JSON
        }
      }
    } catch (error) {
      console.error('[ComputerUse] Screenshot analysis failed:', error);
    }

    return {
      description: 'Analysis unavailable',
      elements: [],
      dataPoints: [],
      actionSuggestions: [],
    };
  }
}
