/**
 * Health & Status System
 *
 * Unified health check and status reporting for Genesis economy.
 * Combines wallet, controller, monitoring, and worker status.
 */

import { getLiveWallet, type LiveWallet } from './wallet.js';
import { getBalanceMonitor, type BalanceSnapshot } from './balance-monitor.js';
import { getRevenueTracker, type RevenueStats } from './revenue-tracker.js';
import { getAlertSystem } from './alerts.js';
import { getStatePersistence } from './persistence.js';
import { getBootResult, isLive } from './boot.js';
import { getAutonomousController } from '../autonomous.js';

// ============================================================================
// Types
// ============================================================================

export interface HealthStatus {
  healthy: boolean;
  timestamp: number;
  uptime: number;
  checks: {
    wallet: ComponentHealth;
    controller: ComponentHealth;
    persistence: ComponentHealth;
    alerts: ComponentHealth;
    worker: ComponentHealth;
  };
  summary: string;
}

export interface ComponentHealth {
  status: 'ok' | 'degraded' | 'error' | 'unknown';
  message: string;
  lastCheck: number;
  details?: Record<string, unknown>;
}

export interface SystemStatus {
  health: HealthStatus;
  wallet: WalletStatus | null;
  controller: ControllerStatus | null;
  revenue: RevenueStats | null;
  balance: BalanceSnapshot | null;
}

export interface WalletStatus {
  address: string;
  network: string;
  ethBalance: string;
  usdcBalance: string;
  connected: boolean;
}

export interface ControllerStatus {
  phase: number;
  phaseName: string;
  cycleCount: number;
  totalRevenue: number;
  totalCosts: number;
  balance: number;
  atNESS: boolean;
  running: boolean;
  lastCycle: number;
}

// ============================================================================
// Health Check
// ============================================================================

/**
 * Perform comprehensive health check.
 */
export async function checkHealth(): Promise<HealthStatus> {
  const startTime = Date.now();
  const bootResult = getBootResult();

  const checks: HealthStatus['checks'] = {
    wallet: { status: 'unknown', message: 'Not checked', lastCheck: startTime },
    controller: { status: 'unknown', message: 'Not checked', lastCheck: startTime },
    persistence: { status: 'unknown', message: 'Not checked', lastCheck: startTime },
    alerts: { status: 'unknown', message: 'Not checked', lastCheck: startTime },
    worker: { status: 'unknown', message: 'Not checked', lastCheck: startTime },
  };

  // 1. Wallet Health
  try {
    const wallet = getLiveWallet();
    if (wallet.isConnected()) {
      const balances = await wallet.getBalances();
      const hasGas = balances.eth > 0n;
      const hasUSDC = balances.usdc > 0n;

      if (hasGas && hasUSDC) {
        checks.wallet = {
          status: 'ok',
          message: `${balances.ethFormatted} ETH, ${balances.usdcFormatted} USDC`,
          lastCheck: Date.now(),
          details: { address: wallet.getAddress() },
        };
      } else if (!hasGas) {
        checks.wallet = {
          status: 'degraded',
          message: 'No ETH for gas',
          lastCheck: Date.now(),
          details: { eth: balances.ethFormatted, usdc: balances.usdcFormatted },
        };
      } else {
        checks.wallet = {
          status: 'degraded',
          message: 'No USDC balance',
          lastCheck: Date.now(),
          details: { eth: balances.ethFormatted, usdc: balances.usdcFormatted },
        };
      }
    } else {
      checks.wallet = {
        status: 'error',
        message: 'Not connected (GENESIS_PRIVATE_KEY missing)',
        lastCheck: Date.now(),
      };
    }
  } catch (error) {
    checks.wallet = {
      status: 'error',
      message: `Error: ${error}`,
      lastCheck: Date.now(),
    };
  }

  // 2. Controller Health
  try {
    if (isLive()) {
      const controller = getAutonomousController();
      const state = controller.getState();
      const cycleLag = Date.now() - state.lastCycle;
      const expectedInterval = 60000; // 1 minute default

      if (cycleLag < expectedInterval * 3) {
        checks.controller = {
          status: 'ok',
          message: `Phase ${state.phase} (${state.phaseName}), ${state.cycleCount} cycles`,
          lastCheck: Date.now(),
          details: {
            revenue: state.totalRevenue,
            costs: state.totalCosts,
            balance: state.currentBalance,
          },
        };
      } else {
        checks.controller = {
          status: 'degraded',
          message: `Cycle lag: ${Math.round(cycleLag / 1000)}s`,
          lastCheck: Date.now(),
        };
      }
    } else {
      checks.controller = {
        status: 'unknown',
        message: 'Not in live mode',
        lastCheck: Date.now(),
      };
    }
  } catch (error) {
    checks.controller = {
      status: 'error',
      message: `Error: ${error}`,
      lastCheck: Date.now(),
    };
  }

  // 3. Persistence Health
  try {
    const persistence = getStatePersistence();
    const state = await persistence.load();
    if (state) {
      const age = Date.now() - new Date(state.savedAt).getTime();
      const ageMinutes = Math.round(age / 60000);
      checks.persistence = {
        status: age < 300000 ? 'ok' : 'degraded', // < 5 min is ok
        message: `Last save: ${ageMinutes}m ago, ${state.cycleCount} cycles`,
        lastCheck: Date.now(),
        details: { savedAt: state.savedAt },
      };
    } else {
      checks.persistence = {
        status: 'ok',
        message: 'No saved state (fresh start)',
        lastCheck: Date.now(),
      };
    }
  } catch (error) {
    checks.persistence = {
      status: 'error',
      message: `Error: ${error}`,
      lastCheck: Date.now(),
    };
  }

  // 4. Alerts Health
  try {
    const alerts = getAlertSystem();
    if (alerts.isConfigured()) {
      checks.alerts = {
        status: 'ok',
        message: 'Alert channels configured',
        lastCheck: Date.now(),
      };
    } else {
      checks.alerts = {
        status: 'degraded',
        message: 'No alert channels configured',
        lastCheck: Date.now(),
      };
    }
  } catch (error) {
    checks.alerts = {
      status: 'error',
      message: `Error: ${error}`,
      lastCheck: Date.now(),
    };
  }

  // 5. Worker Health (via boot result)
  if (bootResult?.workerDeployed && bootResult.workerUrl) {
    try {
      const response = await fetch(`${bootResult.workerUrl}/health`, {
        signal: AbortSignal.timeout(5000),
      });
      if (response.ok) {
        const data = await response.json() as { status: string; version: string };
        checks.worker = {
          status: 'ok',
          message: `v${data.version} at ${bootResult.workerUrl}`,
          lastCheck: Date.now(),
          details: data,
        };
      } else {
        checks.worker = {
          status: 'degraded',
          message: `HTTP ${response.status}`,
          lastCheck: Date.now(),
        };
      }
    } catch (error) {
      checks.worker = {
        status: 'degraded',
        message: `Health check failed: ${error}`,
        lastCheck: Date.now(),
      };
    }
  } else {
    checks.worker = {
      status: 'unknown',
      message: bootResult?.workerDeployed === false ? 'Not deployed' : 'No boot result',
      lastCheck: Date.now(),
    };
  }

  // Compute overall health
  const statuses = Object.values(checks).map(c => c.status);
  const hasError = statuses.includes('error');
  const hasDegraded = statuses.includes('degraded');

  let healthy = !hasError;
  let summary = '';

  if (hasError) {
    const errorChecks = Object.entries(checks)
      .filter(([, c]) => c.status === 'error')
      .map(([name]) => name);
    summary = `Errors: ${errorChecks.join(', ')}`;
  } else if (hasDegraded) {
    const degradedChecks = Object.entries(checks)
      .filter(([, c]) => c.status === 'degraded')
      .map(([name]) => name);
    summary = `Degraded: ${degradedChecks.join(', ')}`;
  } else {
    summary = 'All systems operational';
  }

  return {
    healthy,
    timestamp: Date.now(),
    uptime: bootResult ? Date.now() - (getAutonomousController().getState().startedAt || Date.now()) : 0,
    checks,
    summary,
  };
}

// ============================================================================
// Full Status
// ============================================================================

/**
 * Get complete system status.
 */
export async function getSystemStatus(): Promise<SystemStatus> {
  const health = await checkHealth();

  // Wallet status
  let wallet: WalletStatus | null = null;
  try {
    const w = getLiveWallet();
    if (w.isConnected()) {
      const balances = await w.getBalances();
      wallet = {
        address: w.getAddress(),
        network: process.env.GENESIS_NETWORK ?? 'testnet',
        ethBalance: balances.ethFormatted,
        usdcBalance: balances.usdcFormatted,
        connected: true,
      };
    }
  } catch {
    // No wallet
  }

  // Controller status
  let controller: ControllerStatus | null = null;
  try {
    if (isLive()) {
      const c = getAutonomousController();
      const state = c.getState();
      controller = {
        phase: state.phase,
        phaseName: state.phaseName,
        cycleCount: state.cycleCount,
        totalRevenue: state.totalRevenue,
        totalCosts: state.totalCosts,
        balance: state.currentBalance,
        atNESS: c.isAtNESS(),
        running: state.lastCycle > 0,
        lastCycle: state.lastCycle,
      };
    }
  } catch {
    // Not initialized
  }

  // Revenue stats
  let revenue: RevenueStats | null = null;
  try {
    const tracker = getRevenueTracker();
    await tracker.load();
    revenue = tracker.getStats();
  } catch {
    // Not initialized
  }

  // Balance snapshot
  let balance: BalanceSnapshot | null = null;
  try {
    const monitor = getBalanceMonitor();
    const history = monitor.getHistory();
    if (history.length > 0) {
      balance = history[history.length - 1];
    }
  } catch {
    // Not initialized
  }

  return {
    health,
    wallet,
    controller,
    revenue,
    balance,
  };
}

// ============================================================================
// Status Formatting
// ============================================================================

/**
 * Format status for console output.
 */
export function formatStatus(status: SystemStatus): string {
  const lines: string[] = [];

  // Header
  lines.push('='.repeat(60));
  lines.push('GENESIS ECONOMY STATUS');
  lines.push('='.repeat(60));
  lines.push('');

  // Health
  const healthIcon = status.health.healthy ? '[OK]' : '[!!]';
  lines.push(`${healthIcon} Health: ${status.health.summary}`);
  lines.push('');

  // Component checks
  lines.push('Components:');
  for (const [name, check] of Object.entries(status.health.checks)) {
    const icon = check.status === 'ok' ? '+' : check.status === 'degraded' ? '~' : check.status === 'error' ? 'X' : '?';
    lines.push(`  [${icon}] ${name}: ${check.message}`);
  }
  lines.push('');

  // Wallet
  if (status.wallet) {
    lines.push('Wallet:');
    lines.push(`  Address: ${status.wallet.address}`);
    lines.push(`  Network: ${status.wallet.network}`);
    lines.push(`  ETH: ${status.wallet.ethBalance}`);
    lines.push(`  USDC: ${status.wallet.usdcBalance}`);
    lines.push('');
  }

  // Controller
  if (status.controller) {
    lines.push('Controller:');
    lines.push(`  Phase: ${status.controller.phase} (${status.controller.phaseName})`);
    lines.push(`  Cycles: ${status.controller.cycleCount}`);
    lines.push(`  Revenue: $${status.controller.totalRevenue.toFixed(4)}`);
    lines.push(`  Costs: $${status.controller.totalCosts.toFixed(4)}`);
    lines.push(`  Balance: $${status.controller.balance.toFixed(2)}`);
    lines.push(`  At NESS: ${status.controller.atNESS ? 'Yes' : 'No'}`);
    lines.push('');
  }

  // Revenue
  if (status.revenue) {
    lines.push('Revenue (All Time):');
    lines.push(`  Total: $${status.revenue.total.toFixed(4)}`);
    lines.push(`  Events: ${status.revenue.count}`);
    if (Object.keys(status.revenue.bySource).length > 0) {
      lines.push('  By Source:');
      for (const [source, amount] of Object.entries(status.revenue.bySource)) {
        if (amount > 0) {
          lines.push(`    ${source}: $${amount.toFixed(4)}`);
        }
      }
    }
    lines.push('');
  }

  // Uptime
  const uptimeMs = status.health.uptime;
  const uptimeHours = Math.floor(uptimeMs / 3600000);
  const uptimeMinutes = Math.floor((uptimeMs % 3600000) / 60000);
  lines.push(`Uptime: ${uptimeHours}h ${uptimeMinutes}m`);
  lines.push(`Timestamp: ${new Date(status.health.timestamp).toISOString()}`);
  lines.push('');
  lines.push('='.repeat(60));

  return lines.join('\n');
}

// ============================================================================
// Quick Check
// ============================================================================

/**
 * Quick health check - returns true if healthy, false otherwise.
 */
export async function isHealthy(): Promise<boolean> {
  const health = await checkHealth();
  return health.healthy;
}

/**
 * Get a one-line status summary.
 */
export async function getStatusLine(): Promise<string> {
  try {
    const health = await checkHealth();
    const wallet = getLiveWallet();

    if (!wallet.isConnected()) {
      return '[OFFLINE] Wallet not connected';
    }

    const balances = await wallet.getBalances();
    const controller = getAutonomousController();
    const state = controller.getState();

    const icon = health.healthy ? '[LIVE]' : '[WARN]';
    return `${icon} $${balances.usdcFormatted} USDC | Phase ${state.phase} | ${state.cycleCount} cycles | $${state.totalRevenue.toFixed(2)} revenue`;
  } catch (error) {
    return `[ERROR] ${error}`;
  }
}
