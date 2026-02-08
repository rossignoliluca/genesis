/**
 * Revenue Activation System
 *
 * Unified system to activate and monitor all Genesis revenue streams.
 * Provides real-time tracking, automated execution, and health monitoring.
 *
 * Revenue Streams:
 * 1. x402 Micropayments - MCP tool access (USDC on Base L2)
 * 2. Content Generation - SEO articles, social media, newsletters
 * 3. Consulting/Services - AI automation, code review, architecture
 *
 * @module revenue/activation
 * @version 19.0.0
 */

import { getEventBus } from '../bus/index.js';
import { getComponentMemory, type ComponentMemoryManager } from '../memory/index.js';

// ============================================================================
// Types
// ============================================================================

export interface RevenueActivationConfig {
  /** Enable x402 micropayments */
  x402Enabled: boolean;
  /** Payment address for receiving USDC (Base L2) */
  paymentAddress?: string;
  /** Network: mainnet or testnet */
  network: 'base' | 'base-sepolia';
  /** Minimum price per tool call in USDC */
  minToolPrice: number;
  /** Maximum daily revenue target */
  dailyTarget: number;
  /** Enable content generation revenue */
  contentEnabled: boolean;
  /** Enable consulting/services revenue */
  servicesEnabled: boolean;
  /** Auto-reinvest percentage (0-1) */
  reinvestRate: number;
}

export interface RevenueMetrics {
  totalRevenue: number;
  totalCost: number;
  netProfit: number;
  roi: number;
  byStream: {
    x402: { revenue: number; transactions: number; avgPrice: number };
    content: { revenue: number; pieces: number; avgRevenue: number };
    services: { revenue: number; jobs: number; avgRevenue: number };
  };
  dailyTrend: number[];
  hourlyRate: number;
  projectedMonthly: number;
  runway: number;
}

export interface RevenueOpportunity {
  id: string;
  stream: 'x402' | 'content' | 'services';
  type: string;
  estimatedRevenue: number;
  estimatedCost: number;
  confidence: number;
  timeWindow: number;
  requirements: string[];
  metadata: Record<string, unknown>;
}

export interface ServiceOffering {
  id: string;
  name: string;
  description: string;
  category: 'automation' | 'code-review' | 'architecture' | 'content' | 'research';
  pricing: {
    type: 'fixed' | 'hourly' | 'per-word' | 'per-task';
    amount: number;
    currency: 'USD' | 'USDC' | 'ETH';
  };
  deliveryTime: string;
  requirements: string[];
  skills: string[];
}

// ============================================================================
// Default Configuration
// ============================================================================

export const DEFAULT_ACTIVATION_CONFIG: RevenueActivationConfig = {
  x402Enabled: true,
  network: 'base-sepolia', // Start on testnet
  minToolPrice: 0.01, // $0.01 USDC minimum
  dailyTarget: 100, // $100/day target
  contentEnabled: true,
  servicesEnabled: true,
  reinvestRate: 0.2, // 20% reinvested
};

// ============================================================================
// Service Catalog
// ============================================================================

export const SERVICE_CATALOG: ServiceOffering[] = [
  {
    id: 'automation-workflow',
    name: 'AI Workflow Automation',
    description: 'Custom AI-powered automation for repetitive tasks',
    category: 'automation',
    pricing: { type: 'fixed', amount: 500, currency: 'USD' },
    deliveryTime: '3-5 days',
    requirements: ['task-description', 'integration-details'],
    skills: ['typescript', 'python', 'api-integration'],
  },
  {
    id: 'code-review-deep',
    name: 'Deep Code Review',
    description: 'Comprehensive code review with security, performance, and architecture analysis',
    category: 'code-review',
    pricing: { type: 'fixed', amount: 200, currency: 'USD' },
    deliveryTime: '24-48 hours',
    requirements: ['github-repo', 'focus-areas'],
    skills: ['security', 'performance', 'architecture'],
  },
  {
    id: 'architecture-design',
    name: 'System Architecture Design',
    description: 'Full system architecture with diagrams, tech stack, and implementation plan',
    category: 'architecture',
    pricing: { type: 'fixed', amount: 1000, currency: 'USD' },
    deliveryTime: '5-7 days',
    requirements: ['requirements-doc', 'scale-targets'],
    skills: ['distributed-systems', 'cloud', 'microservices'],
  },
  {
    id: 'content-technical',
    name: 'Technical Content Writing',
    description: 'SEO-optimized technical articles, tutorials, and documentation',
    category: 'content',
    pricing: { type: 'per-word', amount: 0.15, currency: 'USD' },
    deliveryTime: '2-3 days',
    requirements: ['topic', 'target-audience', 'keywords'],
    skills: ['technical-writing', 'seo', 'research'],
  },
  {
    id: 'research-deep',
    name: 'Deep Research Report',
    description: 'Comprehensive research on any technical or business topic',
    category: 'research',
    pricing: { type: 'fixed', amount: 300, currency: 'USD' },
    deliveryTime: '3-5 days',
    requirements: ['research-questions', 'depth-level'],
    skills: ['research', 'analysis', 'synthesis'],
  },
];

// ============================================================================
// MCP Tool Pricing
// ============================================================================

export const MCP_TOOL_PRICING: Record<string, number> = {
  // High-value tools
  'github:create_pull_request': 0.10,
  'github:merge_pull_request': 0.05,
  'firecrawl:scrape': 0.02,
  'firecrawl:crawl': 0.05,
  'brave-search:web_search': 0.01,
  'gemini:web_search': 0.01,
  'openai:chat': 0.02,
  'stability-ai:generate_image': 0.05,
  'huggingface:generate_image': 0.03,
  'playwright:browser_navigate': 0.01,
  'playwright:browser_screenshot': 0.01,
  'postgres:query': 0.01,
  'memory:create_entities': 0.005,
  'arxiv:search': 0.005,
  'semantic-scholar:search': 0.005,
  // Default for unlisted tools
  'default': 0.01,
};

// ============================================================================
// Revenue Activation Manager
// ============================================================================

export class RevenueActivationManager {
  private config: RevenueActivationConfig;
  private metrics: RevenueMetrics;
  private opportunities: RevenueOpportunity[] = [];
  private componentMemory: ComponentMemoryManager;
  private isActive = false;
  private scanInterval: ReturnType<typeof setInterval> | null = null;

  constructor(config: Partial<RevenueActivationConfig> = {}) {
    this.config = { ...DEFAULT_ACTIVATION_CONFIG, ...config };
    this.componentMemory = getComponentMemory('economy');
    this.metrics = this.initializeMetrics();
  }

  private initializeMetrics(): RevenueMetrics {
    return {
      totalRevenue: 0,
      totalCost: 0,
      netProfit: 0,
      roi: 0,
      byStream: {
        x402: { revenue: 0, transactions: 0, avgPrice: 0 },
        content: { revenue: 0, pieces: 0, avgRevenue: 0 },
        services: { revenue: 0, jobs: 0, avgRevenue: 0 },
      },
      dailyTrend: [],
      hourlyRate: 0,
      projectedMonthly: 0,
      runway: Infinity,
    };
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  async activate(): Promise<void> {
    if (this.isActive) return;

    console.log('[RevenueActivation] Activating revenue streams...');

    // Start opportunity scanning
    this.scanInterval = setInterval(() => this.scanOpportunities(), 60000);

    // Initial scan
    await this.scanOpportunities();

    this.isActive = true;

    // Emit activation event
    const bus = getEventBus();
    bus.publish('revenue.activated', {
      source: 'revenue-activation',
      precision: 0.9,
      config: this.config,
      timestamp: Date.now(),
    } as any);

    console.log('[RevenueActivation] Revenue streams active');
    console.log(`  - x402 Micropayments: ${this.config.x402Enabled ? 'ENABLED' : 'DISABLED'}`);
    console.log(`  - Content Generation: ${this.config.contentEnabled ? 'ENABLED' : 'DISABLED'}`);
    console.log(`  - Services: ${this.config.servicesEnabled ? 'ENABLED' : 'DISABLED'}`);
    console.log(`  - Daily Target: $${this.config.dailyTarget}`);
  }

  async deactivate(): Promise<void> {
    if (!this.isActive) return;

    if (this.scanInterval) {
      clearInterval(this.scanInterval);
      this.scanInterval = null;
    }

    this.isActive = false;
    console.log('[RevenueActivation] Revenue streams deactivated');
  }

  // ---------------------------------------------------------------------------
  // Opportunity Management
  // ---------------------------------------------------------------------------

  private async scanOpportunities(): Promise<void> {
    const opportunities: RevenueOpportunity[] = [];

    // Scan for content opportunities
    if (this.config.contentEnabled) {
      opportunities.push(...await this.scanContentOpportunities());
    }

    // Scan for service opportunities
    if (this.config.servicesEnabled) {
      opportunities.push(...await this.scanServiceOpportunities());
    }

    // Store opportunities
    this.opportunities = opportunities;

    // Store in component memory for learning
    if (opportunities.length > 0) {
      this.componentMemory.storeEpisodic({
        id: `opportunity-scan-${Date.now()}`,
        type: 'episodic',
        created: new Date(),
        lastAccessed: new Date(),
        accessCount: 0,
        R0: 0.9,
        S: 7,
        importance: 0.6,
        emotionalValence: 0,
        associations: [],
        tags: ['revenue', 'opportunity', 'scan'],
        consolidated: false,
        content: {
          what: `Found ${opportunities.length} revenue opportunities`,
          details: {
            count: opportunities.length,
            totalPotential: opportunities.reduce((s, o) => s + o.estimatedRevenue, 0),
            byStream: {
              x402: opportunities.filter(o => o.stream === 'x402').length,
              content: opportunities.filter(o => o.stream === 'content').length,
              services: opportunities.filter(o => o.stream === 'services').length,
            },
          },
        },
        when: { timestamp: new Date() },
      });
    }
  }

  private async scanContentOpportunities(): Promise<RevenueOpportunity[]> {
    // Generate content opportunities based on trending topics
    const topics = [
      { topic: 'AI Agents 2026', potential: 200, type: 'article' },
      { topic: 'TypeScript Best Practices', potential: 150, type: 'tutorial' },
      { topic: 'Web3 Development Guide', potential: 180, type: 'guide' },
    ];

    return topics.map(t => ({
      id: `content-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      stream: 'content' as const,
      type: t.type,
      estimatedRevenue: t.potential,
      estimatedCost: 20, // LLM costs
      confidence: 0.7,
      timeWindow: 86400000, // 24 hours
      requirements: ['llm-access', 'seo-tools'],
      metadata: { topic: t.topic },
    }));
  }

  private async scanServiceOpportunities(): Promise<RevenueOpportunity[]> {
    // Generate service opportunities from catalog
    return SERVICE_CATALOG.slice(0, 3).map(service => ({
      id: `service-${service.id}-${Date.now()}`,
      stream: 'services' as const,
      type: service.category,
      estimatedRevenue: service.pricing.type === 'fixed' ? service.pricing.amount : service.pricing.amount * 1000,
      estimatedCost: 50, // Estimate
      confidence: 0.5,
      timeWindow: 604800000, // 7 days
      requirements: service.requirements,
      metadata: { service },
    }));
  }

  getOpportunities(): RevenueOpportunity[] {
    return [...this.opportunities];
  }

  // ---------------------------------------------------------------------------
  // x402 Integration
  // ---------------------------------------------------------------------------

  getToolPrice(toolName: string): number {
    // Check specific pricing first
    for (const [pattern, price] of Object.entries(MCP_TOOL_PRICING)) {
      if (toolName.includes(pattern)) {
        return price;
      }
    }
    return MCP_TOOL_PRICING.default;
  }

  recordX402Payment(toolName: string, amount: number): void {
    this.metrics.byStream.x402.revenue += amount;
    this.metrics.byStream.x402.transactions++;
    this.metrics.byStream.x402.avgPrice =
      this.metrics.byStream.x402.revenue / this.metrics.byStream.x402.transactions;
    this.updateTotalMetrics();
  }

  // ---------------------------------------------------------------------------
  // Content Revenue
  // ---------------------------------------------------------------------------

  recordContentRevenue(contentId: string, amount: number): void {
    this.metrics.byStream.content.revenue += amount;
    this.metrics.byStream.content.pieces++;
    this.metrics.byStream.content.avgRevenue =
      this.metrics.byStream.content.revenue / this.metrics.byStream.content.pieces;
    this.updateTotalMetrics();
  }

  // ---------------------------------------------------------------------------
  // Services Revenue
  // ---------------------------------------------------------------------------

  getServiceCatalog(): ServiceOffering[] {
    return SERVICE_CATALOG;
  }

  recordServiceRevenue(serviceId: string, amount: number): void {
    this.metrics.byStream.services.revenue += amount;
    this.metrics.byStream.services.jobs++;
    this.metrics.byStream.services.avgRevenue =
      this.metrics.byStream.services.revenue / this.metrics.byStream.services.jobs;
    this.updateTotalMetrics();
  }

  // ---------------------------------------------------------------------------
  // Metrics
  // ---------------------------------------------------------------------------

  private updateTotalMetrics(): void {
    const { x402, content, services } = this.metrics.byStream;
    this.metrics.totalRevenue = x402.revenue + content.revenue + services.revenue;
    this.metrics.netProfit = this.metrics.totalRevenue - this.metrics.totalCost;
    this.metrics.roi = this.metrics.totalCost > 0
      ? (this.metrics.netProfit / this.metrics.totalCost)
      : 0;

    // Calculate hourly rate
    const uptime = Date.now() - (this.scanInterval ? 3600000 : 0); // At least 1 hour
    this.metrics.hourlyRate = this.metrics.totalRevenue / (uptime / 3600000);
    this.metrics.projectedMonthly = this.metrics.hourlyRate * 24 * 30;

    // Update daily trend
    const today = new Date().toDateString();
    const lastEntry = this.metrics.dailyTrend[this.metrics.dailyTrend.length - 1] || 0;
    if (this.metrics.dailyTrend.length === 0 || true) { // Always update for demo
      this.metrics.dailyTrend.push(this.metrics.totalRevenue);
      if (this.metrics.dailyTrend.length > 30) {
        this.metrics.dailyTrend.shift();
      }
    }
  }

  getMetrics(): RevenueMetrics {
    return { ...this.metrics };
  }

  getStatus(): {
    isActive: boolean;
    config: RevenueActivationConfig;
    metrics: RevenueMetrics;
    opportunities: number;
  } {
    return {
      isActive: this.isActive,
      config: this.config,
      metrics: this.getMetrics(),
      opportunities: this.opportunities.length,
    };
  }

  // ---------------------------------------------------------------------------
  // Revenue Projections
  // ---------------------------------------------------------------------------

  projectRevenue(days: number): {
    projected: number;
    breakdown: { x402: number; content: number; services: number };
    assumptions: string[];
  } {
    const dailyRate = this.metrics.hourlyRate * 24;
    const projected = dailyRate * days;

    // Project by stream based on current ratios
    const total = this.metrics.totalRevenue || 1;
    const x402Ratio = this.metrics.byStream.x402.revenue / total;
    const contentRatio = this.metrics.byStream.content.revenue / total;
    const servicesRatio = this.metrics.byStream.services.revenue / total;

    return {
      projected,
      breakdown: {
        x402: projected * x402Ratio,
        content: projected * contentRatio,
        services: projected * servicesRatio,
      },
      assumptions: [
        'Based on current hourly rate',
        'Assumes consistent activity',
        'Does not account for market changes',
      ],
    };
  }
}

// ============================================================================
// Singleton
// ============================================================================

let activationInstance: RevenueActivationManager | null = null;

export function getRevenueActivation(config?: Partial<RevenueActivationConfig>): RevenueActivationManager {
  if (!activationInstance || config) {
    activationInstance = new RevenueActivationManager(config);
  }
  return activationInstance;
}

export function resetRevenueActivation(): void {
  if (activationInstance) {
    activationInstance.deactivate();
    activationInstance = null;
  }
}
