/**
 * Economic Health Monitor
 *
 * Unified view of Genesis economic state:
 * - All revenue streams and their status
 * - Fiber balance by module
 * - NESS convergence state
 * - Wallet balances
 * - Active executions
 *
 * @module economy/health
 * @version 19.1.0
 */

import { getEconomicFiber, type EconomicFiber } from './fiber.js';
import { getNESSMonitor, type NESSMonitor, type NESSState } from './ness.js';
import { getRevenueExecutor, type RevenueExecutor } from './revenue-executor.js';
import { getLiveWallet, type LiveWallet } from './live/wallet.js';
import { getGitHubExecutor, type GitHubExecutor } from './live/github-executor.js';
import { getRevenueActivation } from '../revenue/activation.js';
import { getRevenueStats as getContentRevenueStats } from '../content/monetization/index.js';

// ============================================================================
// Types
// ============================================================================

export interface EconomicHealth {
  timestamp: Date;
  overall: 'critical' | 'warning' | 'healthy' | 'thriving';
  overallScore: number; // 0-100

  // Wallet State
  wallet: {
    configured: boolean;
    network: 'mainnet' | 'testnet' | 'unknown';
    ethBalance: number;
    usdcBalance: number;
    address?: string;
  };

  // Revenue Streams
  streams: {
    x402: StreamHealth;
    bounty: StreamHealth;
    content: StreamHealth;
    services: StreamHealth;
    yield: StreamHealth;
    keeper: StreamHealth;
  };

  // Economic Metrics
  metrics: {
    totalRevenue: number;
    totalCost: number;
    netProfit: number;
    roi: number;
    runway: number; // days at current burn rate
    hourlyRate: number;
    dailyRate: number;
    monthlyProjection: number;
  };

  // Module Health (from Fiber)
  modules: Array<{
    id: string;
    revenue: number;
    cost: number;
    roi: number;
    sustainable: boolean;
  }>;

  // NESS State
  ness: {
    converged: boolean;
    deviation: number;
    targetRevenue: number;
    currentRevenue: number;
    convergenceRate: number;
  };

  // Execution State
  executions: {
    pending: number;
    completed: number;
    failed: number;
    successRate: number;
  };

  // Integrations
  integrations: {
    github: boolean;
    stripe: boolean;
    x402: boolean;
    content: boolean;
  };

  // Issues
  issues: string[];
  recommendations: string[];
}

export interface StreamHealth {
  active: boolean;
  configured: boolean;
  revenue: number;
  transactions: number;
  lastActivity?: Date;
  issues: string[];
}

// ============================================================================
// Health Check
// ============================================================================

export async function getEconomicHealth(): Promise<EconomicHealth> {
  const timestamp = new Date();
  const issues: string[] = [];
  const recommendations: string[] = [];

  // ---------------------------------------------------------------------------
  // Wallet Check
  // ---------------------------------------------------------------------------
  let wallet: EconomicHealth['wallet'] = {
    configured: false,
    network: 'unknown',
    ethBalance: 0,
    usdcBalance: 0,
  };

  try {
    const liveWallet = getLiveWallet();
    const walletAddress = liveWallet.getAddress();
    if (walletAddress) {
      wallet.configured = true;
      wallet.address = walletAddress;
      wallet.network = process.env.BASE_NETWORK === 'mainnet' ? 'mainnet' : 'testnet';

      try {
        const balances = await liveWallet.getBalances();
        wallet.ethBalance = parseFloat(balances.ethFormatted);
        wallet.usdcBalance = parseFloat(balances.usdcFormatted);
      } catch {
        issues.push('Failed to fetch wallet balances');
      }

      if (wallet.ethBalance < 0.001) {
        issues.push('ETH balance too low for gas');
        recommendations.push('Fund wallet with ETH for gas fees');
      }
    } else {
      issues.push('Wallet not configured');
      recommendations.push('Set GENESIS_PRIVATE_KEY to enable payments');
    }
  } catch {
    issues.push('Wallet module not available');
  }

  // ---------------------------------------------------------------------------
  // Revenue Activation
  // ---------------------------------------------------------------------------
  let activation;
  try {
    activation = getRevenueActivation();
  } catch {
    // Not initialized
  }

  const activationStatus = activation?.getStatus();
  const activationMetrics = activationStatus?.metrics;

  // ---------------------------------------------------------------------------
  // Stream Health
  // ---------------------------------------------------------------------------
  const streams: EconomicHealth['streams'] = {
    x402: {
      active: activationStatus?.config?.x402Enabled ?? false,
      configured: wallet.configured,
      revenue: activationMetrics?.byStream?.x402?.revenue ?? 0,
      transactions: activationMetrics?.byStream?.x402?.transactions ?? 0,
      issues: [],
    },
    bounty: {
      active: true, // Always scanning
      configured: checkBountyConfig(),
      revenue: 0, // Would come from bounty executor
      transactions: 0,
      issues: [],
    },
    content: {
      active: activationStatus?.config?.contentEnabled ?? false,
      configured: true,
      revenue: activationMetrics?.byStream?.content?.revenue ?? 0,
      transactions: activationMetrics?.byStream?.content?.pieces ?? 0,
      issues: [],
    },
    services: {
      active: activationStatus?.config?.servicesEnabled ?? false,
      configured: true,
      revenue: activationMetrics?.byStream?.services?.revenue ?? 0,
      transactions: activationMetrics?.byStream?.services?.jobs ?? 0,
      issues: [],
    },
    yield: {
      active: false,
      configured: false,
      revenue: 0,
      transactions: 0,
      issues: ['DeFi connectors not configured'],
    },
    keeper: {
      active: false,
      configured: false,
      revenue: 0,
      transactions: 0,
      issues: ['Keeper not implemented'],
    },
  };

  // Check GitHub for bounties
  try {
    const gh = getGitHubExecutor();
    if (!gh.isReady()) {
      streams.bounty.issues.push('GitHub not configured');
      recommendations.push('Set GITHUB_TOKEN and GITHUB_USERNAME for bounty execution');
    }
  } catch {
    streams.bounty.issues.push('GitHub executor not available');
  }

  // Content monetization stats
  try {
    const contentStats = getContentRevenueStats();
    streams.content.revenue = contentStats.totalRevenue;
    streams.content.transactions = contentStats.recordCount;
  } catch {
    // Monetization not initialized
  }

  // ---------------------------------------------------------------------------
  // Metrics
  // ---------------------------------------------------------------------------
  const totalRevenue =
    streams.x402.revenue +
    streams.bounty.revenue +
    streams.content.revenue +
    streams.services.revenue +
    streams.yield.revenue +
    streams.keeper.revenue;

  let totalCost = 0;
  let fiberModules: EconomicHealth['modules'] = [];

  try {
    const fiber = getEconomicFiber();
    const global = fiber.getGlobalSection();
    totalCost = global.totalCosts;
    // getModulesByROI returns sorted module IDs, we need to get details manually
    const moduleIds = fiber.getModulesByROI();
    fiberModules = moduleIds.map(id => {
      const moduleFiber = fiber.getFiber(id);
      const revenue = moduleFiber?.totalEarned ?? 0;
      const cost = moduleFiber?.totalSpent ?? 0;
      const roi = cost > 0 ? (revenue - cost) / cost : 0;
      return {
        id,
        revenue,
        cost,
        roi,
        sustainable: roi > 0,
      };
    });
  } catch {
    // Fiber not initialized
  }

  const netProfit = totalRevenue - totalCost;
  const roi = totalCost > 0 ? netProfit / totalCost : 0;
  const hourlyRate = activationMetrics?.hourlyRate ?? 0;
  const dailyRate = hourlyRate * 24;
  const runway = totalCost > 0 && dailyRate > 0 ? netProfit / dailyRate : Infinity;

  // ---------------------------------------------------------------------------
  // NESS State
  // ---------------------------------------------------------------------------
  let ness: EconomicHealth['ness'] = {
    converged: false,
    deviation: 1,
    targetRevenue: 2639, // Default target
    currentRevenue: totalRevenue,
    convergenceRate: 0,
  };

  try {
    const nessMonitor = getNESSMonitor();
    const nessConfig = nessMonitor.getConfig();
    // NESS computes state from observations
    const fixedPoint = nessMonitor.computeFixedPoint();
    const deviation = totalRevenue > 0 ? Math.abs(totalRevenue - fixedPoint.revenue) / fixedPoint.revenue : 1;
    ness = {
      converged: deviation < 0.1,
      deviation,
      targetRevenue: nessConfig.targetRevenue,
      currentRevenue: totalRevenue,
      convergenceRate: 0, // Would need observation history
    };
  } catch {
    // NESS not initialized
  }

  // ---------------------------------------------------------------------------
  // Execution Stats
  // ---------------------------------------------------------------------------
  let executions: EconomicHealth['executions'] = {
    pending: 0,
    completed: 0,
    failed: 0,
    successRate: 0,
  };

  try {
    const executor = getRevenueExecutor();
    const stats = executor.getStats();
    executions = {
      pending: stats.pendingCount,
      completed: stats.successCount,
      failed: stats.failureCount,
      successRate: stats.successCount > 0 ? stats.successCount / (stats.successCount + stats.failureCount) : 0,
    };
  } catch {
    // Executor not initialized
  }

  // ---------------------------------------------------------------------------
  // Integration Status
  // ---------------------------------------------------------------------------
  const integrations: EconomicHealth['integrations'] = {
    github: checkGitHubConfig(),
    stripe: !!process.env.STRIPE_SECRET_KEY || !!process.env.STRIPE_API_KEY,
    x402: wallet.configured,
    content: true, // Content module is always available
  };

  if (!integrations.stripe) {
    recommendations.push('Set STRIPE_SECRET_KEY for fiat payments');
  }

  // ---------------------------------------------------------------------------
  // Overall Score
  // ---------------------------------------------------------------------------
  let score = 0;

  // Wallet: 20 points
  if (wallet.configured) score += 10;
  if (wallet.ethBalance >= 0.001) score += 5;
  if (wallet.usdcBalance > 0) score += 5;

  // Streams: 40 points (max)
  if (streams.x402.active && streams.x402.configured) score += 8;
  if (streams.bounty.active && streams.bounty.configured) score += 8;
  if (streams.content.active) score += 8;
  if (streams.services.active) score += 8;
  if (streams.yield.active) score += 4;
  if (streams.keeper.active) score += 4;

  // Revenue: 20 points
  if (totalRevenue > 0) score += 10;
  if (roi > 0) score += 5;
  if (netProfit > 0) score += 5;

  // NESS: 10 points
  if (ness.converged) score += 10;
  else if (ness.deviation < 0.5) score += 5;

  // Integrations: 10 points
  if (integrations.github) score += 3;
  if (integrations.stripe) score += 3;
  if (integrations.x402) score += 2;
  if (integrations.content) score += 2;

  let overall: EconomicHealth['overall'];
  if (score < 25) overall = 'critical';
  else if (score < 50) overall = 'warning';
  else if (score < 75) overall = 'healthy';
  else overall = 'thriving';

  // ---------------------------------------------------------------------------
  // Build Result
  // ---------------------------------------------------------------------------
  return {
    timestamp,
    overall,
    overallScore: Math.min(100, score),
    wallet,
    streams,
    metrics: {
      totalRevenue,
      totalCost,
      netProfit,
      roi,
      runway: runway === Infinity ? -1 : runway,
      hourlyRate,
      dailyRate,
      monthlyProjection: dailyRate * 30,
    },
    modules: fiberModules,
    ness,
    executions,
    integrations,
    issues,
    recommendations,
  };
}

// ============================================================================
// Helpers
// ============================================================================

function checkBountyConfig(): boolean {
  return !!(process.env.GITHUB_TOKEN && process.env.GITHUB_USERNAME);
}

function checkGitHubConfig(): boolean {
  return !!(process.env.GITHUB_TOKEN && process.env.GITHUB_USERNAME);
}

// ============================================================================
// CLI Formatter
// ============================================================================

export function formatHealthReport(health: EconomicHealth): string {
  const statusEmoji = {
    critical: '🔴',
    warning: '🟡',
    healthy: '🟢',
    thriving: '🚀',
  };

  const lines: string[] = [
    '',
    '╔══════════════════════════════════════════════════════════════╗',
    '║                   GENESIS ECONOMIC HEALTH                    ║',
    '╠══════════════════════════════════════════════════════════════╣',
    '',
    `  Overall: ${statusEmoji[health.overall]} ${health.overall.toUpperCase()} (Score: ${health.overallScore}/100)`,
    '',
    '  ─── WALLET ───',
    '',
    `  Configured:    ${health.wallet.configured ? '✅ Yes' : '❌ No'}`,
    `  Network:       ${health.wallet.network}`,
    `  ETH Balance:   ${health.wallet.ethBalance.toFixed(4)} ETH`,
    `  USDC Balance:  $${health.wallet.usdcBalance.toFixed(2)}`,
    health.wallet.address ? `  Address:       ${health.wallet.address.slice(0, 10)}...${health.wallet.address.slice(-8)}` : '',
    '',
    '  ─── REVENUE STREAMS ───',
    '',
  ];

  for (const [name, stream] of Object.entries(health.streams)) {
    const status = stream.active ? (stream.configured ? '✅' : '⚠️') : '❌';
    lines.push(`  ${status} ${name.padEnd(12)} $${stream.revenue.toFixed(2).padStart(10)} (${stream.transactions} txns)`);
  }

  lines.push(
    '',
    '  ─── METRICS ───',
    '',
    `  Total Revenue:   $${health.metrics.totalRevenue.toFixed(2)}`,
    `  Total Cost:      $${health.metrics.totalCost.toFixed(2)}`,
    `  Net Profit:      $${health.metrics.netProfit.toFixed(2)}`,
    `  ROI:             ${(health.metrics.roi * 100).toFixed(1)}%`,
    `  Hourly Rate:     $${health.metrics.hourlyRate.toFixed(2)}`,
    `  Daily Rate:      $${health.metrics.dailyRate.toFixed(2)}`,
    `  Monthly Proj:    $${health.metrics.monthlyProjection.toFixed(2)}`,
    health.metrics.runway >= 0 ? `  Runway:          ${health.metrics.runway.toFixed(1)} days` : '',
    '',
    '  ─── NESS ───',
    '',
    `  Converged:       ${health.ness.converged ? '✅ Yes' : '❌ No'}`,
    `  Deviation:       ${(health.ness.deviation * 100).toFixed(1)}%`,
    `  Target Revenue:  $${health.ness.targetRevenue}/mo`,
    `  Current Revenue: $${health.ness.currentRevenue.toFixed(2)}`,
    '',
    '  ─── EXECUTIONS ───',
    '',
    `  Pending:         ${health.executions.pending}`,
    `  Completed:       ${health.executions.completed}`,
    `  Failed:          ${health.executions.failed}`,
    `  Success Rate:    ${(health.executions.successRate * 100).toFixed(1)}%`,
    '',
    '  ─── INTEGRATIONS ───',
    '',
    `  GitHub:          ${health.integrations.github ? '✅' : '❌'}`,
    `  Stripe:          ${health.integrations.stripe ? '✅' : '❌'}`,
    `  x402:            ${health.integrations.x402 ? '✅' : '❌'}`,
    `  Content:         ${health.integrations.content ? '✅' : '❌'}`,
  );

  if (health.issues.length > 0) {
    lines.push('', '  ─── ISSUES ───', '');
    for (const issue of health.issues) {
      lines.push(`  ⚠️  ${issue}`);
    }
  }

  if (health.recommendations.length > 0) {
    lines.push('', '  ─── RECOMMENDATIONS ───', '');
    for (const rec of health.recommendations) {
      lines.push(`  💡 ${rec}`);
    }
  }

  lines.push(
    '',
    '╚══════════════════════════════════════════════════════════════╝',
    '',
  );

  return lines.filter(l => l !== '').join('\n');
}
