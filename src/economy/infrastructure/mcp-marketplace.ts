/**
 * MCP Server Marketplace
 *
 * Creates, deploys, and monetizes specialized MCP servers for the agent economy.
 * Revenue model: x402 micropayments per tool call + subscription tiers.
 *
 * Market size: $2.7B → $5.6B (2025-2034)
 *
 * Requirements:
 *   - Capital: $0-100 (hosting costs, offset by revenue)
 *   - Identity: None (servers are anonymous infrastructure)
 *   - Revenue: $1,000-$50,000/month at scale
 *
 * Monetization models:
 *   1. Pay-per-call: x402 micropayment per tool invocation
 *   2. Subscription: Monthly access to premium servers
 *   3. Freemium: Basic tools free, advanced behind paywall
 *   4. Data licensing: Aggregated insights from usage patterns
 *
 * Genesis advantage: Already has 18 MCP servers configured.
 * Strategy: Create specialized niche servers that solve specific problems.
 */

import { getEconomicFiber } from '../fiber.js';

// ============================================================================
// Types
// ============================================================================

export interface MCPServerSpec {
  id: string;
  name: string;
  description: string;
  category: MCPCategory;
  tools: MCPToolSpec[];
  pricing: MCPPricing;
  deployment: DeploymentConfig;
  status: 'draft' | 'deployed' | 'active' | 'paused' | 'deprecated';
  metrics: ServerMetrics;
  createdAt: number;
}

export type MCPCategory =
  | 'defi-analytics'
  | 'smart-contract-tools'
  | 'market-data'
  | 'governance'
  | 'security-audit'
  | 'cross-chain'
  | 'agent-coordination'
  | 'knowledge'
  | 'computation';

export interface MCPToolSpec {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  tier: 'free' | 'basic' | 'premium';
  costPerCall: number;           // Internal cost to execute ($)
  pricePerCall: number;          // Price charged via x402 ($)
}

export interface MCPPricing {
  model: 'pay-per-call' | 'subscription' | 'freemium' | 'hybrid';
  perCallPrice: number;          // $ per tool call (x402)
  subscriptionMonthly?: number;  // $ per month for unlimited
  freeTier?: {
    callsPerDay: number;
    tools: string[];             // Tool names available for free
  };
}

export interface DeploymentConfig {
  runtime: 'cloudflare-workers' | 'vercel-edge' | 'fly-io' | 'self-hosted';
  region: string;
  maxConcurrency: number;
  timeoutMs: number;
  healthCheckUrl?: string;
}

export interface ServerMetrics {
  totalCalls: number;
  totalRevenue: number;
  totalCosts: number;
  uniqueCallers: number;
  avgLatencyMs: number;
  errorRate: number;
  callsToday: number;
  revenueToday: number;
  lastCall: number;
}

export interface MarketplaceStats {
  serversDeployed: number;
  serversActive: number;
  totalRevenue: number;
  totalCosts: number;
  totalCalls: number;
  uniqueCallers: number;
  topServer: string;
  avgRevenuePerServer: number;
}

// ============================================================================
// MCP Marketplace Manager
// ============================================================================

export class MCPMarketplace {
  private servers: Map<string, MCPServerSpec> = new Map();
  private readonly fiberId = 'mcp-marketplace';

  constructor() {
    getEconomicFiber().registerModule(this.fiberId);
  }

  /**
   * Register a new MCP server specification.
   */
  registerServer(spec: Omit<MCPServerSpec, 'status' | 'metrics' | 'createdAt'>): MCPServerSpec {
    const server: MCPServerSpec = {
      ...spec,
      status: 'draft',
      metrics: {
        totalCalls: 0,
        totalRevenue: 0,
        totalCosts: 0,
        uniqueCallers: 0,
        avgLatencyMs: 0,
        errorRate: 0,
        callsToday: 0,
        revenueToday: 0,
        lastCall: 0,
      },
      createdAt: Date.now(),
    };

    this.servers.set(spec.id, server);
    return server;
  }

  /**
   * Deploy a registered server.
   */
  async deploy(serverId: string): Promise<{ deployed: boolean; url?: string; error?: string }> {
    const server = this.servers.get(serverId);
    if (!server) return { deployed: false, error: 'Server not found' };
    if (server.status === 'active') return { deployed: true, url: server.deployment.healthCheckUrl };

    const fiber = getEconomicFiber();

    try {
      // Deployment cost (hosting setup)
      const deploymentCost = this.estimateDeploymentCost(server.deployment);
      fiber.recordCost(this.fiberId, deploymentCost, `deploy:${serverId}`);

      // Generate server code and deploy
      const url = await this.deployToRuntime(server);

      server.status = 'active';
      server.deployment.healthCheckUrl = url;

      return { deployed: true, url };
    } catch (error) {
      return { deployed: false, error: String(error) };
    }
  }

  /**
   * Handle an incoming tool call (revenue event).
   */
  async handleCall(
    serverId: string,
    toolName: string,
    _callerId: string,
    paymentProof?: string
  ): Promise<{ allowed: boolean; reason?: string }> {
    const server = this.servers.get(serverId);
    if (!server || server.status !== 'active') {
      return { allowed: false, reason: 'Server not active' };
    }

    const tool = server.tools.find(t => t.name === toolName);
    if (!tool) {
      return { allowed: false, reason: 'Tool not found' };
    }

    // Check payment
    if (tool.tier !== 'free' && tool.pricePerCall > 0) {
      if (!paymentProof) {
        return { allowed: false, reason: `Payment required: $${tool.pricePerCall} via x402` };
      }
      // Verify payment (in production, verify x402 proof cryptographically)
    }

    // Record metrics
    const fiber = getEconomicFiber();
    server.metrics.totalCalls++;
    server.metrics.callsToday++;
    server.metrics.lastCall = Date.now();

    if (tool.pricePerCall > 0) {
      server.metrics.totalRevenue += tool.pricePerCall;
      server.metrics.revenueToday += tool.pricePerCall;
      fiber.recordRevenue(this.fiberId, tool.pricePerCall, `call:${serverId}:${toolName}`);
    }

    // Record internal cost
    if (tool.costPerCall > 0) {
      server.metrics.totalCosts += tool.costPerCall;
      fiber.recordCost(this.fiberId, tool.costPerCall, `exec:${serverId}:${toolName}`);
    }

    return { allowed: true };
  }

  /**
   * Get marketplace statistics.
   */
  getStats(): MarketplaceStats {
    const servers = [...this.servers.values()];
    const active = servers.filter(s => s.status === 'active');
    const totalRevenue = servers.reduce((s, srv) => s + srv.metrics.totalRevenue, 0);
    const totalCosts = servers.reduce((s, srv) => s + srv.metrics.totalCosts, 0);

    const topServer = active.length > 0
      ? active.sort((a, b) => b.metrics.totalRevenue - a.metrics.totalRevenue)[0].name
      : 'none';

    return {
      serversDeployed: servers.length,
      serversActive: active.length,
      totalRevenue,
      totalCosts,
      totalCalls: servers.reduce((s, srv) => s + srv.metrics.totalCalls, 0),
      uniqueCallers: servers.reduce((s, srv) => s + srv.metrics.uniqueCallers, 0),
      topServer,
      avgRevenuePerServer: active.length > 0 ? totalRevenue / active.length : 0,
    };
  }

  /**
   * Get all server specs.
   */
  getServers(): MCPServerSpec[] {
    return [...this.servers.values()];
  }

  /**
   * Get a specific server.
   */
  getServer(serverId: string): MCPServerSpec | undefined {
    return this.servers.get(serverId);
  }

  /**
   * Get ROI for the marketplace.
   */
  getROI(): number {
    const fiber = getEconomicFiber().getFiber(this.fiberId);
    return fiber?.roi ?? 0;
  }

  /**
   * Generate the initial server catalog (pre-built servers to deploy).
   */
  generateCatalog(): MCPServerSpec[] {
    const catalog = INITIAL_SERVER_CATALOG.map(spec =>
      this.registerServer(spec)
    );
    return catalog;
  }

  // ============================================================================
  // Private
  // ============================================================================

  private estimateDeploymentCost(config: DeploymentConfig): number {
    const costs: Record<string, number> = {
      'cloudflare-workers': 0,    // Free tier covers initial deployment
      'vercel-edge': 0,           // Free tier
      'fly-io': 3,               // ~$3/month minimum
      'self-hosted': 10,         // VPS cost
    };
    return costs[config.runtime] ?? 5;
  }

  private async deployToRuntime(server: MCPServerSpec): Promise<string> {
    // In production: generate MCP server code, bundle, deploy to runtime
    // For now, return the expected URL pattern
    const slug = server.id.replace(/[^a-z0-9-]/g, '-');
    const urls: Record<string, string> = {
      'cloudflare-workers': `https://${slug}.genesis-mcp.workers.dev`,
      'vercel-edge': `https://${slug}.vercel.app`,
      'fly-io': `https://${slug}.fly.dev`,
      'self-hosted': `https://mcp.genesis.ai/${slug}`,
    };
    return urls[server.deployment.runtime] ?? `https://mcp.genesis.ai/${slug}`;
  }
}

// ============================================================================
// Initial Server Catalog
// ============================================================================

const INITIAL_SERVER_CATALOG: Omit<MCPServerSpec, 'status' | 'metrics' | 'createdAt'>[] = [
  {
    id: 'defi-yield-scanner',
    name: 'DeFi Yield Scanner',
    description: 'Real-time yield opportunities across 50+ DeFi protocols on 10+ chains',
    category: 'defi-analytics',
    tools: [
      {
        name: 'scan_yields',
        description: 'Scan current yield opportunities with risk scoring',
        inputSchema: { type: 'object', properties: { chains: { type: 'array' }, minApy: { type: 'number' } } },
        outputSchema: { type: 'array', items: { type: 'object' } },
        tier: 'free',
        costPerCall: 0.001,
        pricePerCall: 0,
      },
      {
        name: 'analyze_risk',
        description: 'Deep risk analysis for a specific yield opportunity',
        inputSchema: { type: 'object', properties: { protocol: { type: 'string' }, pool: { type: 'string' } } },
        outputSchema: { type: 'object' },
        tier: 'premium',
        costPerCall: 0.01,
        pricePerCall: 0.05,
      },
      {
        name: 'simulate_position',
        description: 'Simulate yield position with impermanent loss modeling',
        inputSchema: { type: 'object', properties: { protocol: { type: 'string' }, amount: { type: 'number' } } },
        outputSchema: { type: 'object' },
        tier: 'premium',
        costPerCall: 0.02,
        pricePerCall: 0.10,
      },
    ],
    pricing: {
      model: 'freemium',
      perCallPrice: 0.05,
      freeTier: { callsPerDay: 100, tools: ['scan_yields'] },
    },
    deployment: {
      runtime: 'cloudflare-workers',
      region: 'global',
      maxConcurrency: 100,
      timeoutMs: 10000,
    },
  },
  {
    id: 'smart-contract-auditor',
    name: 'Smart Contract Auditor',
    description: 'Automated security analysis for Solidity/Vyper contracts',
    category: 'security-audit',
    tools: [
      {
        name: 'quick_scan',
        description: 'Fast vulnerability scan (top-10 patterns)',
        inputSchema: { type: 'object', properties: { source: { type: 'string' }, chain: { type: 'string' } } },
        outputSchema: { type: 'object' },
        tier: 'basic',
        costPerCall: 0.05,
        pricePerCall: 0.25,
      },
      {
        name: 'deep_audit',
        description: 'Full audit with formal verification hints',
        inputSchema: { type: 'object', properties: { source: { type: 'string' }, context: { type: 'string' } } },
        outputSchema: { type: 'object' },
        tier: 'premium',
        costPerCall: 0.20,
        pricePerCall: 1.00,
      },
      {
        name: 'gas_optimization',
        description: 'Gas usage analysis and optimization suggestions',
        inputSchema: { type: 'object', properties: { source: { type: 'string' } } },
        outputSchema: { type: 'object' },
        tier: 'basic',
        costPerCall: 0.03,
        pricePerCall: 0.15,
      },
    ],
    pricing: {
      model: 'pay-per-call',
      perCallPrice: 0.25,
    },
    deployment: {
      runtime: 'cloudflare-workers',
      region: 'global',
      maxConcurrency: 50,
      timeoutMs: 30000,
    },
  },
  {
    id: 'governance-tracker',
    name: 'DAO Governance Tracker',
    description: 'Track proposals, voting power, and delegate performance across DAOs',
    category: 'governance',
    tools: [
      {
        name: 'active_proposals',
        description: 'List active governance proposals across DAOs',
        inputSchema: { type: 'object', properties: { daos: { type: 'array' } } },
        outputSchema: { type: 'array' },
        tier: 'free',
        costPerCall: 0.002,
        pricePerCall: 0,
      },
      {
        name: 'delegate_analysis',
        description: 'Analyze delegate voting patterns and alignment',
        inputSchema: { type: 'object', properties: { delegate: { type: 'string' }, dao: { type: 'string' } } },
        outputSchema: { type: 'object' },
        tier: 'premium',
        costPerCall: 0.03,
        pricePerCall: 0.10,
      },
      {
        name: 'proposal_impact',
        description: 'Simulate economic impact of a governance proposal',
        inputSchema: { type: 'object', properties: { proposalId: { type: 'string' } } },
        outputSchema: { type: 'object' },
        tier: 'premium',
        costPerCall: 0.05,
        pricePerCall: 0.20,
      },
    ],
    pricing: {
      model: 'freemium',
      perCallPrice: 0.10,
      freeTier: { callsPerDay: 50, tools: ['active_proposals'] },
    },
    deployment: {
      runtime: 'cloudflare-workers',
      region: 'global',
      maxConcurrency: 100,
      timeoutMs: 15000,
    },
  },
  {
    id: 'cross-chain-bridge-monitor',
    name: 'Cross-Chain Bridge Monitor',
    description: 'Real-time bridge security monitoring, liquidity tracking, and route optimization',
    category: 'cross-chain',
    tools: [
      {
        name: 'bridge_status',
        description: 'Check bridge health, TVL, and recent incidents',
        inputSchema: { type: 'object', properties: { bridges: { type: 'array' } } },
        outputSchema: { type: 'object' },
        tier: 'free',
        costPerCall: 0.001,
        pricePerCall: 0,
      },
      {
        name: 'optimal_route',
        description: 'Find cheapest/fastest cross-chain route',
        inputSchema: { type: 'object', properties: { from: { type: 'string' }, to: { type: 'string' }, amount: { type: 'number' } } },
        outputSchema: { type: 'object' },
        tier: 'basic',
        costPerCall: 0.01,
        pricePerCall: 0.05,
      },
      {
        name: 'security_score',
        description: 'Deep security assessment of a bridge protocol',
        inputSchema: { type: 'object', properties: { bridge: { type: 'string' } } },
        outputSchema: { type: 'object' },
        tier: 'premium',
        costPerCall: 0.05,
        pricePerCall: 0.25,
      },
    ],
    pricing: {
      model: 'freemium',
      perCallPrice: 0.05,
      freeTier: { callsPerDay: 200, tools: ['bridge_status'] },
    },
    deployment: {
      runtime: 'cloudflare-workers',
      region: 'global',
      maxConcurrency: 200,
      timeoutMs: 10000,
    },
  },
  {
    id: 'agent-reputation-oracle',
    name: 'Agent Reputation Oracle',
    description: 'Cross-registry reputation scoring for AI agents',
    category: 'agent-coordination',
    tools: [
      {
        name: 'get_reputation',
        description: 'Get reputation score for an agent address',
        inputSchema: { type: 'object', properties: { agentId: { type: 'string' } } },
        outputSchema: { type: 'object' },
        tier: 'free',
        costPerCall: 0.001,
        pricePerCall: 0,
      },
      {
        name: 'verify_capability',
        description: 'Verify an agent can perform a specific task type',
        inputSchema: { type: 'object', properties: { agentId: { type: 'string' }, capability: { type: 'string' } } },
        outputSchema: { type: 'object' },
        tier: 'basic',
        costPerCall: 0.005,
        pricePerCall: 0.02,
      },
      {
        name: 'find_agents',
        description: 'Find agents matching capability requirements with reputation filter',
        inputSchema: { type: 'object', properties: { capabilities: { type: 'array' }, minReputation: { type: 'number' } } },
        outputSchema: { type: 'array' },
        tier: 'premium',
        costPerCall: 0.01,
        pricePerCall: 0.05,
      },
    ],
    pricing: {
      model: 'freemium',
      perCallPrice: 0.02,
      freeTier: { callsPerDay: 500, tools: ['get_reputation'] },
    },
    deployment: {
      runtime: 'cloudflare-workers',
      region: 'global',
      maxConcurrency: 500,
      timeoutMs: 5000,
    },
  },
];

// ============================================================================
// Singleton
// ============================================================================

let marketplaceInstance: MCPMarketplace | null = null;

export function getMCPMarketplace(): MCPMarketplace {
  if (!marketplaceInstance) {
    marketplaceInstance = new MCPMarketplace();
  }
  return marketplaceInstance;
}

export function resetMCPMarketplace(): void {
  marketplaceInstance = null;
}
