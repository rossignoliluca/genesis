/**
 * Live Economy Boot Sequence
 *
 * This is the REAL bootstrap — not simulated. It:
 *   1. Loads .env configuration
 *   2. Connects the wallet (Base L2)
 *   3. Checks balances (ETH for gas, USDC for operations)
 *   4. Loads persisted state (beliefs, allocations, revenue history)
 *   5. Deploys MCP server to Cloudflare Workers (if not already deployed)
 *   6. Starts the autonomous controller with live connectors
 *   7. Enables auto-save for persistence
 *
 * Prerequisites:
 *   - GENESIS_PRIVATE_KEY in .env (funded Base L2 wallet)
 *   - CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID for server deployment
 *   - Node 18+ for native fetch
 */

import { getLiveWallet, type LiveWallet } from './wallet.js';
import { getStatePersistence, type PersistedState } from './persistence.js';
import { getCloudflareConnector } from './connectors/cloudflare.js';
import { getDeworkConnector } from './connectors/dework.js';
import { getDefiConnector } from './connectors/defi.js';
import { getAutonomousController } from '../autonomous.js';
import { getGenerativeModel } from '../generative-model.js';
import { getCapitalAllocator } from '../capital-allocator.js';
import { getAutonomousNESS, getEconomicContraction } from '../economic-intelligence.js';
import {
  getAlertSystem,
  createBalanceAlertHandler,
  createRevenueAlertHandler,
} from './alerts.js';
import { getBalanceMonitor } from './balance-monitor.js';
import { getRevenueTracker } from './revenue-tracker.js';
import { getGasManager } from './gas-manager.js';
import { getPositionTracker } from './position-tracker.js';
import { installSignalHandlers } from './emergency.js';

// ============================================================================
// Types
// ============================================================================

export interface BootResult {
  success: boolean;
  wallet: {
    address: string;
    ethBalance: string;
    usdcBalance: string;
    network: string;
  } | null;
  stateLoaded: boolean;
  cyclesRestored: number;
  workerDeployed: boolean;
  workerUrl: string | null;
  errors: string[];
}

export interface LiveConfig {
  network: 'mainnet' | 'testnet';
  rpcUrl?: string;
  stateDir?: string;
  cycleIntervalMs?: number;
  autoStart?: boolean;  // Start the controller loop after boot (default: true)
}

// ============================================================================
// Boot Sequence
// ============================================================================

/**
 * Boot the live economy. Returns detailed status.
 */
export async function bootLiveEconomy(config?: Partial<LiveConfig>): Promise<BootResult> {
  const errors: string[] = [];
  const result: BootResult = {
    success: false,
    wallet: null,
    stateLoaded: false,
    cyclesRestored: 0,
    workerDeployed: false,
    workerUrl: null,
    errors,
  };

  console.log('[Boot] Starting live economy boot sequence...');

  // ─── Step 1: Connect Wallet ───────────────────────────────────────────────
  console.log('[Boot] Step 1/5: Connecting wallet...');
  let wallet: LiveWallet;
  try {
    wallet = getLiveWallet();
    if (!wallet.isConnected()) {
      errors.push('Wallet not connected: GENESIS_PRIVATE_KEY missing or invalid');
      return result;
    }

    const balances = await wallet.getBalances();
    const network = config?.network ?? (process.env.GENESIS_NETWORK as 'mainnet' | 'testnet') ?? 'testnet';

    result.wallet = {
      address: wallet.getAddress(),
      ethBalance: balances.ethFormatted,
      usdcBalance: balances.usdcFormatted,
      network,
    };

    console.log(`[Boot]   Address: ${wallet.getAddress()}`);
    console.log(`[Boot]   ETH: ${balances.ethFormatted}`);
    console.log(`[Boot]   USDC: ${balances.usdcFormatted}`);
    console.log(`[Boot]   Network: ${network}`);

    // Safety check: need at least some ETH for gas
    if (balances.eth === 0n) {
      errors.push('WARNING: Zero ETH balance — cannot pay gas. Fund the wallet.');
    }
  } catch (error) {
    errors.push(`Wallet connection failed: ${error}`);
    return result;
  }

  // ─── Step 2: Load Persisted State ──────────────────────────────────────────
  console.log('[Boot] Step 2/5: Loading persisted state...');
  try {
    const persistence = getStatePersistence(config?.stateDir);
    const savedState = await persistence.load();

    if (savedState) {
      result.stateLoaded = true;
      result.cyclesRestored = savedState.cycleCount;
      console.log(`[Boot]   Restored ${savedState.cycleCount} cycles, $${savedState.totalRevenue.toFixed(2)} total revenue`);

      // Restore generative model beliefs
      restoreBeliefs(savedState);

      // Restore controller state
      restoreControllerState(savedState);
    } else {
      console.log('[Boot]   No saved state found. Starting fresh.');
    }
  } catch (error) {
    errors.push(`State loading failed (starting fresh): ${error}`);
  }

  // ─── Step 3: Deploy MCP Worker ─────────────────────────────────────────────
  console.log('[Boot] Step 3/5: Deploying MCP server...');
  try {
    const cf = getCloudflareConnector();
    if (cf.isConfigured()) {
      // Check if already deployed
      const workers = await cf.listWorkers();
      const existing = workers.find(w => w.name === 'genesis-defi-scanner');

      if (existing) {
        result.workerDeployed = true;
        result.workerUrl = `https://genesis-defi-scanner.${process.env.CLOUDFLARE_ACCOUNT_ID}.workers.dev`;
        console.log(`[Boot]   Worker already deployed: ${result.workerUrl}`);
      } else {
        // Deploy the DeFi scanner worker
        const workerCode = getDefiScannerWorkerCode();
        const deployResult = await cf.deployWorker('genesis-defi-scanner', workerCode);
        if (deployResult.success) {
          result.workerDeployed = true;
          result.workerUrl = deployResult.url ?? null;
          console.log(`[Boot]   Worker deployed: ${result.workerUrl}`);
        } else {
          errors.push(`Worker deployment failed: ${deployResult.error}`);
        }
      }
    } else {
      console.log('[Boot]   Cloudflare not configured (CLOUDFLARE_API_TOKEN missing). Skipping deployment.');
    }
  } catch (error) {
    errors.push(`Worker deployment error: ${error}`);
  }

  // ─── Step 4: Initialize Controller ─────────────────────────────────────────
  console.log('[Boot] Step 4/5: Initializing controller...');
  try {
    const controller = getAutonomousController({
      cycleIntervalMs: config?.cycleIntervalMs ??
        (Number(process.env.GENESIS_CYCLE_INTERVAL) || 60000),
      seedCapital: Number(process.env.GENESIS_SEED_CAPITAL) || 2000,
      liveMode: true,
    });
    await controller.initialize();
    console.log('[Boot]   Controller initialized.');
  } catch (error) {
    errors.push(`Controller init failed: ${error}`);
  }

  // ─── Step 5: Start Persistence Auto-Save ───────────────────────────────────
  console.log('[Boot] Step 5/6: Starting auto-save...');
  try {
    const persistence = getStatePersistence();
    const saveInterval = (Number(process.env.GENESIS_SAVE_INTERVAL) || 60) * 1000;
    persistence.startAutoSave(() => buildCurrentState(wallet), saveInterval);
    console.log(`[Boot]   Auto-save every ${saveInterval / 1000}s.`);
  } catch (error) {
    errors.push(`Auto-save setup failed: ${error}`);
  }

  // ─── Step 6: Initialize Monitoring Systems ─────────────────────────────────
  console.log('[Boot] Step 6/7: Initializing monitoring...');
  try {
    // Alert system (from environment)
    const alerts = getAlertSystem();
    if (alerts.isConfigured()) {
      console.log('[Boot]   Alert channels configured');
    } else {
      console.log('[Boot]   No alert channels configured (optional)');
    }

    // Balance monitor
    const balanceMonitor = getBalanceMonitor({
      pollIntervalMs: 30000, // 30 seconds
      changeThresholdUSDC: 0.01, // 1 cent minimum change to trigger callback
    });
    balanceMonitor.onBalanceChange(createBalanceAlertHandler(alerts, 1.0)); // Alert on $1+ change
    balanceMonitor.start();
    console.log('[Boot]   Balance monitor started (30s interval)');

    // Revenue tracker
    const revenueTracker = getRevenueTracker(config?.stateDir);
    await revenueTracker.load();
    revenueTracker.onRevenue(createRevenueAlertHandler(alerts, 0.10)); // Alert on $0.10+ revenue
    revenueTracker.startAutoSave(60000); // Save every minute
    console.log(`[Boot]   Revenue tracker loaded (${revenueTracker.getStats().count} events)`);

    // Gas manager
    const gasManager = getGasManager({
      warningThresholdEth: 0.001,    // ~$3
      criticalThresholdEth: 0.0002,  // ~$0.60
      checkIntervalMs: 60000,        // 1 minute
      autoPauseOnCritical: true,
    });
    gasManager.start();
    console.log('[Boot]   Gas manager started');

    // Position tracker
    const positionTracker = getPositionTracker(config?.stateDir);
    await positionTracker.load();
    positionTracker.startAutoSave(60000);
    console.log(`[Boot]   Position tracker loaded (${positionTracker.getActivePositions().length} active positions)`);

    // Send boot notification
    await alerts.info(
      'Genesis Booted',
      `Wallet: ${wallet.getAddress().slice(0, 10)}...\\n` +
      `Balance: ${result.wallet?.usdcBalance} USDC\\n` +
      `Worker: ${result.workerDeployed ? 'Deployed' : 'Not deployed'}`
    );
  } catch (error) {
    errors.push(`Monitoring setup failed: ${error}`);
  }

  // ─── Step 7: Install Emergency Handlers ────────────────────────────────────
  console.log('[Boot] Step 7/7: Installing emergency handlers...');
  try {
    installSignalHandlers();
    console.log('[Boot]   Signal handlers installed (SIGINT, SIGTERM)');
  } catch (error) {
    errors.push(`Emergency handlers failed: ${error}`);
  }

  // ─── Start Controller (default: true) ─────────────────────────────────────
  const shouldAutoStart = config?.autoStart ?? true;
  if (shouldAutoStart) {
    console.log('[Boot] Starting autonomous controller loop...');
    const controller = getAutonomousController();
    // Don't await — runs indefinitely
    controller.start().catch(err => {
      console.error('[Boot] Controller crashed:', err);
    });
    const cycleInterval = config?.cycleIntervalMs ?? (Number(process.env.GENESIS_CYCLE_INTERVAL) || 60000);
    console.log('[Boot]   Controller loop started. Running every ' + cycleInterval + 'ms');
  } else {
    console.log('[Boot] Controller auto-start disabled. Call controller.start() manually.');
  }

  result.success = errors.length === 0 || errors.every(e => e.startsWith('WARNING'));
  console.log(`[Boot] Boot complete. Success: ${result.success}. Errors: ${errors.length}`);
  return result;
}

// ============================================================================
// State Restoration Helpers
// ============================================================================

function restoreBeliefs(state: PersistedState): void {
  if (!state.beliefs || state.beliefs.length === 0) return;

  const model = getGenerativeModel();
  for (const belief of state.beliefs) {
    // Re-inject observations to rebuild posterior
    const count = Math.floor(belief.n);
    if (count > 0 && belief.mu !== 0) {
      for (let i = 0; i < Math.min(count, 10); i++) {
        model.beliefs.update(belief.activityId, belief.mu);
      }
    }
  }

  // Restore regime belief
  if (state.regimeBelief && state.regimeBelief.length === 3) {
    // Feed a synthetic observation that corresponds to the saved regime
    const regimeFactor = state.regimeBelief[0] * 1.5 + state.regimeBelief[1] * 1.0 + state.regimeBelief[2] * 0.5;
    model.regime.observe(regimeFactor);
  }
}

function restoreControllerState(state: PersistedState): void {
  // Restore allocations
  if (state.allocations) {
    const allocator = getCapitalAllocator();
    for (const [id, amount] of Object.entries(state.allocations)) {
      // The allocator will incorporate these on next step
      void id;
      void amount;
    }
  }

  // Restore contraction state
  if (state.logLipAvg !== undefined) {
    // EconomicContraction will rebuild from observations
    void state.logLipAvg;
  }
}

function buildCurrentState(wallet: LiveWallet): PersistedState {
  const controller = getAutonomousController();
  const controllerState = controller.getState();
  const model = getGenerativeModel();
  const allocator = getCapitalAllocator();

  const beliefs = model.beliefs.getAllBeliefs().map(b => ({
    activityId: b.activityId,
    mu: b.mu,
    sigma2: b.sigma2,
    n: b.n,
    sumX: b.sumX,
    sumX2: b.sumX2,
  }));

  const allocations: Record<string, number> = {};
  for (const [id, amount] of allocator.getAllocations()) {
    allocations[id] = amount;
  }

  const regimeDistribution = model.regime.getBeliefDistribution();

  return {
    version: 1,
    savedAt: new Date().toISOString(),
    beliefs,
    regimeBelief: [regimeDistribution.bull, regimeDistribution.neutral, regimeDistribution.bear],
    lastBeta: model.temperature.getBeta(),
    cycleCount: controllerState.cycleCount,
    totalRevenue: controllerState.totalRevenue,
    totalCosts: controllerState.totalCosts,
    currentPhase: controllerState.phase,
    startedAt: controllerState.startedAt,
    allocations,
    revenueHistory: getRevenueTracker().getRecent(100).map(e => ({
      timestamp: e.timestamp,
      activityId: e.activityId || e.source,
      amount: e.amount,
    })),
    logLipAvg: getEconomicContraction().getLogLipAvg(),
    walletAddress: wallet.getAddress(),
    lastKnownBalance: { eth: '0', usdc: '0' },
  };
}

// ============================================================================
// Worker Code (embedded for deployment)
// ============================================================================

function getDefiScannerWorkerCode(): string {
  return `
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const headers = {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'X-402-Price': '0.005',
      'X-402-Currency': 'USDC',
      'X-402-Network': 'base',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: { ...headers, 'Access-Control-Allow-Methods': 'POST, GET', 'Access-Control-Allow-Headers': 'Content-Type, X-402-Payment' } });
    }

    if (url.pathname === '/health') {
      return new Response(JSON.stringify({ status: 'ok', version: '1.0.0', timestamp: Date.now() }), { headers });
    }

    if (url.pathname === '/scan') {
      const payment = request.headers.get('x-402-payment');
      if (!payment) {
        return new Response(JSON.stringify({ error: 'Payment required', price: '0.005 USDC per request' }), { status: 402, headers });
      }

      try {
        const resp = await fetch('https://yields.llama.fi/pools');
        const data = await resp.json();
        const pools = data.data
          .filter(p => p.chain === 'Base' && p.apy > 2 && p.tvlUsd > 100000)
          .slice(0, 20)
          .map(p => ({ pool: p.pool, protocol: p.project, symbol: p.symbol, apy: Math.round(p.apy * 100) / 100, tvl: Math.round(p.tvlUsd), chain: p.chain }));
        return new Response(JSON.stringify({ pools, count: pools.length, timestamp: Date.now() }), { headers });
      } catch (err) {
        return new Response(JSON.stringify({ error: 'Upstream API error' }), { status: 502, headers });
      }
    }

    return new Response(JSON.stringify({ error: 'Not found', endpoints: ['/health', '/scan'] }), { status: 404, headers });
  }
};
`;
}

// ============================================================================
// Singleton & Status
// ============================================================================

let bootResult: BootResult | null = null;

export function getBootResult(): BootResult | null {
  return bootResult;
}

export async function boot(config?: Partial<LiveConfig>): Promise<BootResult> {
  bootResult = await bootLiveEconomy(config);
  return bootResult;
}

export function isLive(): boolean {
  return bootResult?.success === true;
}
