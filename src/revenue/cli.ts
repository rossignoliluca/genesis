/**
 * Revenue CLI Commands
 *
 * Command-line interface for managing Genesis revenue streams.
 *
 * Commands:
 * - revenue status: Show current revenue metrics
 * - revenue activate: Activate all revenue streams
 * - revenue opportunities: List current opportunities
 * - revenue services: List available services
 * - revenue project: Project future revenue
 *
 * @module revenue/cli
 * @version 19.0.0
 */

import {
  getRevenueActivation,
  SERVICE_CATALOG,
  MCP_TOOL_PRICING,
  type RevenueMetrics,
  type RevenueOpportunity,
  type ServiceOffering,
} from './activation.js';

// ============================================================================
// Output Formatting
// ============================================================================

function formatUSD(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount);
}

function formatPercent(ratio: number): string {
  return `${(ratio * 100).toFixed(1)}%`;
}

function progressBar(ratio: number, width = 20): string {
  const filled = Math.round(ratio * width);
  const empty = width - filled;
  return `[${'█'.repeat(filled)}${'░'.repeat(empty)}]`;
}

// ============================================================================
// Status Command
// ============================================================================

export async function showStatus(): Promise<string> {
  const activation = getRevenueActivation();
  const status = activation.getStatus();
  const metrics = status.metrics;

  const lines: string[] = [
    '',
    '╔══════════════════════════════════════════════════════════════╗',
    '║                    GENESIS REVENUE STATUS                     ║',
    '╠══════════════════════════════════════════════════════════════╣',
    '',
    `  Status: ${status.isActive ? '🟢 ACTIVE' : '🔴 INACTIVE'}`,
    `  Network: ${status.config.network === 'base' ? '🌐 Base Mainnet' : '🧪 Base Sepolia (Testnet)'}`,
    '',
    '  ─── REVENUE SUMMARY ───',
    '',
    `  Total Revenue:    ${formatUSD(metrics.totalRevenue)}`,
    `  Total Cost:       ${formatUSD(metrics.totalCost)}`,
    `  Net Profit:       ${formatUSD(metrics.netProfit)}`,
    `  ROI:              ${formatPercent(metrics.roi)}`,
    '',
    '  ─── BY STREAM ───',
    '',
    `  x402 Micropayments:`,
    `    Revenue:        ${formatUSD(metrics.byStream.x402.revenue)}`,
    `    Transactions:   ${metrics.byStream.x402.transactions}`,
    `    Avg Price:      ${formatUSD(metrics.byStream.x402.avgPrice)}`,
    '',
    `  Content Generation:`,
    `    Revenue:        ${formatUSD(metrics.byStream.content.revenue)}`,
    `    Pieces:         ${metrics.byStream.content.pieces}`,
    `    Avg Revenue:    ${formatUSD(metrics.byStream.content.avgRevenue)}`,
    '',
    `  Services:`,
    `    Revenue:        ${formatUSD(metrics.byStream.services.revenue)}`,
    `    Jobs:           ${metrics.byStream.services.jobs}`,
    `    Avg Revenue:    ${formatUSD(metrics.byStream.services.avgRevenue)}`,
    '',
    '  ─── PROJECTIONS ───',
    '',
    `  Hourly Rate:      ${formatUSD(metrics.hourlyRate)}`,
    `  Daily Rate:       ${formatUSD(metrics.hourlyRate * 24)}`,
    `  Monthly Proj:     ${formatUSD(metrics.projectedMonthly)}`,
    '',
    `  Opportunities:    ${status.opportunities}`,
    '',
    '╚══════════════════════════════════════════════════════════════╝',
    '',
  ];

  return lines.join('\n');
}

// ============================================================================
// Activate Command
// ============================================================================

export async function activateRevenue(): Promise<string> {
  const activation = getRevenueActivation();

  if (activation.getStatus().isActive) {
    return '\n⚠️  Revenue streams are already active.\n\nUse "revenue status" to see current metrics.\n';
  }

  await activation.activate();

  return `
╔══════════════════════════════════════════════════════════════╗
║                   REVENUE STREAMS ACTIVATED                   ║
╠══════════════════════════════════════════════════════════════╣

  ✅ x402 Micropayments:  ENABLED
  ✅ Content Generation:  ENABLED
  ✅ Services:            ENABLED

  ─── NEXT STEPS ───

  1. Deploy MCP servers for x402 monetization:
     $ genesis deploy mcp --monetize

  2. Start content generation:
     $ genesis content create --topic "AI in 2026"

  3. Accept service requests:
     $ genesis services accept <job-id>

  ─── MONITORING ───

  View status:      $ genesis revenue status
  View metrics:     $ genesis revenue project 30
  List services:    $ genesis revenue services

╚══════════════════════════════════════════════════════════════╝
`;
}

// ============================================================================
// Opportunities Command
// ============================================================================

export async function listOpportunities(): Promise<string> {
  const activation = getRevenueActivation();
  const opportunities = activation.getOpportunities();

  if (opportunities.length === 0) {
    return '\n📭 No opportunities found. Scanning...\n\nTry again in a minute or run "revenue activate" first.\n';
  }

  const lines: string[] = [
    '',
    '╔══════════════════════════════════════════════════════════════╗',
    '║                   REVENUE OPPORTUNITIES                       ║',
    '╠══════════════════════════════════════════════════════════════╣',
    '',
  ];

  for (const opp of opportunities) {
    const roi = ((opp.estimatedRevenue - opp.estimatedCost) / opp.estimatedCost * 100).toFixed(0);
    const confidence = progressBar(opp.confidence, 10);

    lines.push(
      `  📍 ${opp.type.toUpperCase()} (${opp.stream})`,
      `     Revenue:    ${formatUSD(opp.estimatedRevenue)}`,
      `     Cost:       ${formatUSD(opp.estimatedCost)}`,
      `     ROI:        ${roi}%`,
      `     Confidence: ${confidence} ${formatPercent(opp.confidence)}`,
      `     ID:         ${opp.id}`,
      ''
    );
  }

  lines.push(
    '╚══════════════════════════════════════════════════════════════╝',
    ''
  );

  return lines.join('\n');
}

// ============================================================================
// Services Command
// ============================================================================

export async function listServices(): Promise<string> {
  const lines: string[] = [
    '',
    '╔══════════════════════════════════════════════════════════════╗',
    '║                    GENESIS SERVICE CATALOG                    ║',
    '╠══════════════════════════════════════════════════════════════╣',
    '',
  ];

  for (const service of SERVICE_CATALOG) {
    const price = service.pricing.type === 'fixed'
      ? formatUSD(service.pricing.amount)
      : service.pricing.type === 'per-word'
        ? `${formatUSD(service.pricing.amount)}/word`
        : `${formatUSD(service.pricing.amount)}/hour`;

    lines.push(
      `  🔹 ${service.name}`,
      `     ${service.description}`,
      `     Category:  ${service.category}`,
      `     Price:     ${price}`,
      `     Delivery:  ${service.deliveryTime}`,
      `     Skills:    ${service.skills.join(', ')}`,
      `     ID:        ${service.id}`,
      ''
    );
  }

  lines.push(
    '  ─── HOW TO ORDER ───',
    '',
    '  1. Contact: genesis@example.com',
    '  2. Provide requirements',
    '  3. Pay via USDC (Base L2) or Stripe',
    '  4. Receive deliverable',
    '',
    '╚══════════════════════════════════════════════════════════════╝',
    ''
  );

  return lines.join('\n');
}

// ============================================================================
// Tools Pricing Command
// ============================================================================

export async function listToolPricing(): Promise<string> {
  const lines: string[] = [
    '',
    '╔══════════════════════════════════════════════════════════════╗',
    '║                    MCP TOOL PRICING (x402)                    ║',
    '╠══════════════════════════════════════════════════════════════╣',
    '',
    '  Payment: USDC on Base L2',
    '  Protocol: HTTP 402 (x402)',
    '',
    '  ─── TOOL PRICES ───',
    '',
  ];

  const sorted = Object.entries(MCP_TOOL_PRICING)
    .filter(([k]) => k !== 'default')
    .sort(([, a], [, b]) => b - a);

  for (const [tool, price] of sorted) {
    lines.push(`  ${tool.padEnd(35)} ${formatUSD(price)}`);
  }

  lines.push(
    '',
    `  ${'(default for unlisted)'.padEnd(35)} ${formatUSD(MCP_TOOL_PRICING.default)}`,
    '',
    '╚══════════════════════════════════════════════════════════════╝',
    ''
  );

  return lines.join('\n');
}

// ============================================================================
// Project Command
// ============================================================================

export async function projectRevenue(days: number): Promise<string> {
  const activation = getRevenueActivation();
  const projection = activation.projectRevenue(days);

  const lines: string[] = [
    '',
    '╔══════════════════════════════════════════════════════════════╗',
    `║              REVENUE PROJECTION (${days} DAYS)                    ║`,
    '╠══════════════════════════════════════════════════════════════╣',
    '',
    `  Projected Total:  ${formatUSD(projection.projected)}`,
    '',
    '  ─── BY STREAM ───',
    '',
    `  x402 Micropayments:  ${formatUSD(projection.breakdown.x402)}`,
    `  Content Generation:  ${formatUSD(projection.breakdown.content)}`,
    `  Services:            ${formatUSD(projection.breakdown.services)}`,
    '',
    '  ─── ASSUMPTIONS ───',
    '',
  ];

  for (const assumption of projection.assumptions) {
    lines.push(`  • ${assumption}`);
  }

  lines.push(
    '',
    '╚══════════════════════════════════════════════════════════════╝',
    ''
  );

  return lines.join('\n');
}

// ============================================================================
// Main CLI Handler
// ============================================================================

export async function handleRevenueCommand(args: string[]): Promise<string> {
  const subcommand = args[0] || 'status';

  switch (subcommand) {
    case 'status':
      return showStatus();

    case 'activate':
      return activateRevenue();

    case 'opportunities':
    case 'opps':
      return listOpportunities();

    case 'services':
      return listServices();

    case 'tools':
    case 'pricing':
      return listToolPricing();

    case 'project':
      const days = parseInt(args[1]) || 30;
      return projectRevenue(days);

    case 'help':
    default:
      return `
Genesis Revenue CLI

Usage: genesis revenue <command>

Commands:
  status          Show current revenue metrics
  activate        Activate all revenue streams
  opportunities   List current revenue opportunities
  services        List available service offerings
  tools           List MCP tool pricing
  project [days]  Project revenue (default: 30 days)
  help            Show this help message

Examples:
  genesis revenue status
  genesis revenue activate
  genesis revenue project 90
`;
  }
}
