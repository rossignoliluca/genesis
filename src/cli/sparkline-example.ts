/**
 * Example integration of sparkline components with Genesis UI
 * Demonstrates how to use sparklines in status displays, dashboards, etc.
 */

import { COLORS, style } from './ui';
import {
  sparkline,
  confidenceBar,
  trendIndicator,
  costMeter,
  latencyIndicator,
  tokenCounter,
} from './sparkline';

/**
 * Example: Enhanced status line with sparklines
 */
export function enhancedStatusLine(metrics: {
  phi: number;
  phiHistory: number[];
  previousPhi: number;
  tokens: number;
  maxTokens: number;
  cost: number;
  budget: number;
  latency: number;
}): string {
  const parts: string[] = [];

  // φ with sparkline history
  const phiColor = metrics.phi > 0.7 ? 'green' : metrics.phi > 0.4 ? 'yellow' : 'red';
  parts.push(
    style('φ:', phiColor) +
    sparkline(metrics.phiHistory, { width: 10, color: phiColor as any }) +
    style(` ${metrics.phi.toFixed(2)}`, phiColor) +
    ' ' + trendIndicator(metrics.phi, metrics.previousPhi)
  );

  // Tokens
  parts.push(tokenCounter(metrics.tokens, metrics.maxTokens, 8));

  // Cost
  parts.push(costMeter(metrics.cost, metrics.budget, 8));

  // Latency
  parts.push(latencyIndicator(metrics.latency));

  return parts.join(style(' │ ', 'dim'));
}

/**
 * Example: Model comparison dashboard
 */
export function modelComparisonDashboard(models: Array<{
  name: string;
  confidence: number;
  responseTime: number[];
  cost: number;
  quality: number;
}>): string {
  const lines: string[] = [];

  lines.push(style('═'.repeat(70), 'cyan'));
  lines.push(style(' Model Performance Dashboard', 'bold', 'cyan'));
  lines.push(style('═'.repeat(70), 'cyan'));
  lines.push('');

  for (const model of models) {
    const avgLatency = model.responseTime.reduce((a, b) => a + b, 0) / model.responseTime.length;

    lines.push(
      style(model.name.padEnd(20), 'bold') +
      sparkline(model.responseTime, { width: 15 }) +
      '  ' +
      latencyIndicator(Math.round(avgLatency)) +
      '  ' +
      confidenceBar(model.confidence, 10) +
      '  ' +
      style(`$${model.cost.toFixed(4)}`, 'yellow')
    );
  }

  lines.push('');
  lines.push(style('─'.repeat(70), 'dim'));

  return lines.join('\n');
}

/**
 * Example: Real-time metrics widget
 */
export function metricsWidget(data: {
  title: string;
  values: number[];
  current: number;
  max: number;
  unit: string;
}): string {
  const lines: string[] = [];

  lines.push(style(`┌─ ${data.title} `, 'cyan') + style('─'.repeat(50 - data.title.length), 'cyan'));
  lines.push(style('│', 'cyan') + '  ' + sparkline(data.values, { width: 40, color: 'cyan' }));
  lines.push(
    style('│', 'cyan') +
    `  Current: ${style(String(data.current), 'bold')}${data.unit}  ` +
    confidenceBar(data.current / data.max, 10)
  );
  lines.push(style('└' + '─'.repeat(51), 'cyan'));

  return lines.join('\n');
}

/**
 * Example: Compact inline metrics (for logs/chat)
 */
export function inlineMetrics(
  tokens: number,
  maxTokens: number,
  cost: number,
  latency: number
): string {
  return [
    tokenCounter(tokens, maxTokens, 6),
    style(`$${cost.toFixed(3)}`, 'yellow'),
    latencyIndicator(latency),
  ].join(style(' · ', 'dim'));
}

// Example usage in comments:
/*
const status = enhancedStatusLine({
  phi: 0.78,
  phiHistory: [0.45, 0.52, 0.63, 0.71, 0.75, 0.78],
  previousPhi: 0.75,
  tokens: 3500,
  maxTokens: 4096,
  cost: 0.0085,
  budget: 0.01,
  latency: 89,
});
console.log(status);

const dashboard = modelComparisonDashboard([
  {
    name: 'Claude Opus 4.5',
    confidence: 0.92,
    responseTime: [850, 920, 780, 890, 810],
    cost: 0.0150,
    quality: 0.95,
  },
  {
    name: 'Claude Sonnet 4',
    confidence: 0.88,
    responseTime: [320, 350, 298, 340, 315],
    cost: 0.0030,
    quality: 0.87,
  },
  {
    name: 'Claude Haiku 4',
    confidence: 0.75,
    responseTime: [95, 105, 88, 98, 102],
    cost: 0.0005,
    quality: 0.72,
  },
]);
console.log(dashboard);

const widget = metricsWidget({
  title: 'Memory Usage',
  values: [45, 52, 48, 55, 62, 58, 65, 70, 68, 72],
  current: 72,
  max: 100,
  unit: 'MB',
});
console.log(widget);

console.log('\nInline:', inlineMetrics(3842, 4096, 0.0085, 89));
*/
