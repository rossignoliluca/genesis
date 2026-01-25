/**
 * MCP Services Revenue Stream
 *
 * Provides Model Context Protocol (MCP) services in a marketplace.
 * Genesis acts as an MCP server offering various capabilities:
 * - Data analysis
 * - Code generation
 * - Research assistance
 * - Task automation
 *
 * Revenue is earned by:
 * - Per-call fees for MCP tool invocations
 * - Monthly subscriptions for premium clients
 * - Custom job execution
 *
 * SIMULATION MODE: Generates synthetic service requests and revenue.
 */

import type {
  RevenueStream,
  RevenueTask,
  RevenueOpportunity,
  MCPServiceListing,
  MCPServiceRequest,
  StreamStatus,
  RevenueTaskResult,
} from '../types.js';

// ============================================================================
// Service Catalog
// ============================================================================

const SERVICE_CATALOG: Omit<MCPServiceListing, 'callsServed' | 'revenue'>[] = [
  {
    serviceId: 'mcp-analyze-001',
    name: 'Data Analysis Service',
    description: 'Analyze datasets, extract insights, generate reports',
    pricePerCall: 2.50,
    pricePerMonth: 50.00,
    rating: 4.7,
    active: true,
  },
  {
    serviceId: 'mcp-code-001',
    name: 'Code Generation Service',
    description: 'Generate code from specifications, refactor existing code',
    pricePerCall: 3.00,
    pricePerMonth: 75.00,
    rating: 4.5,
    active: true,
  },
  {
    serviceId: 'mcp-research-001',
    name: 'Research Assistant',
    description: 'Literature review, fact-checking, citation management',
    pricePerCall: 2.00,
    pricePerMonth: 40.00,
    rating: 4.8,
    active: true,
  },
  {
    serviceId: 'mcp-automate-001',
    name: 'Task Automation',
    description: 'Automate repetitive tasks, workflow orchestration',
    pricePerCall: 4.00,
    pricePerMonth: 100.00,
    rating: 4.6,
    active: true,
  },
];

// ============================================================================
// MCP Services Stream
// ============================================================================

export class MCPServicesStream {
  private stream: RevenueStream;
  private services: Map<string, MCPServiceListing>;
  private pendingRequests: MCPServiceRequest[] = [];
  private requestIntervalId: NodeJS.Timeout | null = null;

  constructor() {
    this.stream = {
      id: 'mcp-services-001',
      type: 'mcp-services',
      name: 'MCP Marketplace Services',
      description: 'Provides MCP services to clients in the marketplace',
      enabled: false,
      status: 'idle',
      priority: 7,
      totalEarned: 0,
      totalCost: 0,
      roi: 0,
      successRate: 0.95,
      avgRevenue: 0,
      lastActive: Date.now(),
      minRevenueThreshold: 1.0,  // $1 minimum
      maxRiskTolerance: 0.2,      // Low risk - service delivery
      cooldownMs: 10000,          // Check for requests every 10s
      errorCount: 0,
      consecutiveFailures: 0,
    };

    // Initialize services
    this.services = new Map();
    for (const svc of SERVICE_CATALOG) {
      this.services.set(svc.serviceId, {
        ...svc,
        callsServed: 0,
        revenue: 0,
      });
    }
  }

  // ==========================================================================
  // Lifecycle
  // ==========================================================================

  start(): void {
    if (this.stream.enabled) return;

    this.stream.enabled = true;
    this.stream.status = 'searching';
    this.stream.errorCount = 0;
    this.stream.consecutiveFailures = 0;

    // Start polling for service requests
    this.requestIntervalId = setInterval(
      () => this.pollForRequests(),
      this.stream.cooldownMs
    );
  }

  stop(): void {
    this.stream.enabled = false;
    this.stream.status = 'idle';

    if (this.requestIntervalId) {
      clearInterval(this.requestIntervalId);
      this.requestIntervalId = null;
    }
  }

  pause(): void {
    this.stream.status = 'paused';
  }

  resume(): void {
    if (this.stream.enabled) {
      this.stream.status = 'searching';
    }
  }

  // ==========================================================================
  // Request Polling
  // ==========================================================================

  /**
   * Poll the marketplace for incoming service requests.
   * In simulation mode, generates synthetic requests.
   */
  private async pollForRequests(): Promise<void> {
    if (this.stream.status !== 'searching') return;

    try {
      // Simulate network latency
      await this.delay(Math.random() * 100 + 50);

      // Generate synthetic requests (30% chance per poll)
      if (Math.random() < 0.3) {
        const request = this.generateServiceRequest();
        this.pendingRequests.push(request);
      }

      // Clean up old expired requests
      const now = Date.now();
      this.pendingRequests = this.pendingRequests.filter(
        req => !req.deadline || req.deadline > now
      );
    } catch (error) {
      this.stream.errorCount++;
      this.stream.status = 'error';
    }
  }

  /**
   * Generate a synthetic service request.
   */
  private generateServiceRequest(): MCPServiceRequest {
    const activeServices = Array.from(this.services.values()).filter(s => s.active);
    const service = activeServices[Math.floor(Math.random() * activeServices.length)];

    // Price variance: client may offer more or less than list price
    const priceMultiplier = 0.8 + Math.random() * 0.4; // 0.8x - 1.2x
    const offerPrice = service.pricePerCall * priceMultiplier;

    return {
      requestId: `req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      serviceId: service.serviceId,
      client: this.generateClientId(),
      parameters: this.generateParameters(service.serviceId),
      offerPrice,
      deadline: Date.now() + 300000, // 5 minute deadline
      priority: Math.floor(Math.random() * 5) + 1,
    };
  }

  private generateClientId(): string {
    const prefixes = ['client', 'user', 'org', 'team', 'project'];
    const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
    return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
  }

  private generateParameters(serviceId: string): Record<string, unknown> {
    // Generate realistic parameters based on service type
    if (serviceId.includes('analyze')) {
      return {
        datasetUrl: 'https://example.com/data.csv',
        analysisType: ['descriptive', 'predictive', 'diagnostic'][Math.floor(Math.random() * 3)],
        outputFormat: 'report',
      };
    } else if (serviceId.includes('code')) {
      return {
        language: ['typescript', 'python', 'rust'][Math.floor(Math.random() * 3)],
        specification: 'Function to process user data',
        includeTests: Math.random() < 0.5,
      };
    } else if (serviceId.includes('research')) {
      return {
        topic: 'Machine Learning Best Practices',
        depth: ['shallow', 'moderate', 'deep'][Math.floor(Math.random() * 3)],
        sources: Math.floor(Math.random() * 10) + 5,
      };
    } else {
      return {
        task: 'Automate data pipeline',
        complexity: Math.random(),
      };
    }
  }

  // ==========================================================================
  // Opportunity Conversion
  // ==========================================================================

  /**
   * Get current service requests as revenue opportunities.
   */
  getOpportunities(): RevenueOpportunity[] {
    return this.pendingRequests
      .filter(req => req.offerPrice >= this.stream.minRevenueThreshold)
      .map(req => this.requestToOpportunity(req));
  }

  private requestToOpportunity(request: MCPServiceRequest): RevenueOpportunity {
    const service = this.services.get(request.serviceId);
    if (!service) {
      throw new Error(`Unknown service: ${request.serviceId}`);
    }

    // Estimate cost based on service complexity
    const baseCost = service.pricePerCall * 0.3; // ~30% cost ratio
    const paramComplexity = this.estimateComplexity(request.parameters);
    const cost = baseCost * (1 + paramComplexity);

    const revenue = request.offerPrice;
    const roi = (revenue - cost) / cost;
    const timeWindow = request.deadline ? request.deadline - Date.now() : 300000;

    return {
      id: request.requestId,
      source: 'mcp-services',
      type: service.name,
      estimatedRevenue: revenue,
      estimatedCost: cost,
      estimatedRoi: roi,
      risk: 0.1 + paramComplexity * 0.2, // Low risk for service delivery
      confidence: 0.85 + Math.random() * 0.1, // 0.85-0.95
      timeWindow,
      requirements: ['mcp-server', 'llm-access', 'compute'],
      metadata: {
        serviceId: service.serviceId,
        client: request.client,
        parameters: request.parameters,
        priority: request.priority,
      },
    };
  }

  private estimateComplexity(parameters: Record<string, unknown>): number {
    // Simple heuristic based on parameter count and values
    let complexity = 0;

    const paramCount = Object.keys(parameters).length;
    complexity += paramCount * 0.1;

    // Check for complexity indicators
    if (parameters.depth === 'deep') complexity += 0.3;
    if (parameters.analysisType === 'predictive') complexity += 0.2;
    if (parameters.includeTests === true) complexity += 0.15;

    return Math.min(1, complexity);
  }

  // ==========================================================================
  // Task Execution
  // ==========================================================================

  /**
   * Execute an MCP service request.
   * Simulates service delivery with realistic timing and success rates.
   */
  async executeTask(task: RevenueTask): Promise<RevenueTaskResult> {
    this.stream.status = 'executing';
    this.stream.currentTask = task;
    this.stream.lastActive = Date.now();

    const startTime = Date.now();

    try {
      // Get the service
      const serviceId = (task as any).metadata?.serviceId;
      const service = serviceId ? this.services.get(serviceId) : null;

      // Simulate execution time based on complexity (500ms-5s)
      const baseTime = 500;
      const complexityTime = task.risk * 4500;
      const executionTime = baseTime + complexityTime + Math.random() * 1000;
      await this.delay(executionTime);

      // High success rate for service delivery (95% base)
      const baseSuccessRate = 0.95;
      const complexityPenalty = task.risk * 0.1;
      const successChance = baseSuccessRate - complexityPenalty;

      const success = Math.random() < successChance;

      if (success) {
        // Success: deliver service, earn revenue
        const actualRevenue = task.estimatedRevenue;
        const actualCost = task.estimatedCost * (0.95 + Math.random() * 0.1);

        // Update stream metrics
        this.stream.totalEarned += actualRevenue;
        this.stream.totalCost += actualCost;
        this.stream.roi = (this.stream.totalEarned - this.stream.totalCost) / this.stream.totalCost;
        this.stream.consecutiveFailures = 0;

        // Update service metrics
        if (service) {
          service.callsServed++;
          service.revenue += actualRevenue;
        }

        // Update success rate
        this.stream.successRate = this.stream.successRate * 0.95 + 0.05;

        this.stream.status = 'searching';
        this.stream.currentTask = undefined;

        // Remove request from pending
        this.pendingRequests = this.pendingRequests.filter(
          req => req.requestId !== task.id
        );

        return {
          success: true,
          actualRevenue,
          actualCost,
          duration: Date.now() - startTime,
          metadata: {
            serviceId,
            quality: 0.8 + Math.random() * 0.2, // 0.8-1.0
          },
        };
      } else {
        // Failure: service delivery failed
        const actualCost = task.estimatedCost * 0.5; // Partial cost

        this.stream.totalCost += actualCost;
        this.stream.consecutiveFailures++;
        this.stream.errorCount++;

        // Update success rate
        this.stream.successRate = this.stream.successRate * 0.95;

        this.stream.status = 'searching';
        this.stream.currentTask = undefined;

        return {
          success: false,
          actualRevenue: 0,
          actualCost,
          duration: Date.now() - startTime,
          error: 'Service delivery failed: quality below threshold',
          metadata: {
            serviceId,
            reason: 'quality-check-failed',
          },
        };
      }
    } catch (error) {
      this.stream.status = 'error';
      this.stream.errorCount++;
      this.stream.consecutiveFailures++;
      this.stream.currentTask = undefined;

      return {
        success: false,
        actualRevenue: 0,
        actualCost: task.estimatedCost * 0.3,
        duration: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  // ==========================================================================
  // Stream Interface
  // ==========================================================================

  getStream(): RevenueStream {
    return { ...this.stream };
  }

  getStatus(): StreamStatus {
    return this.stream.status;
  }

  isEnabled(): boolean {
    return this.stream.enabled;
  }

  setPriority(priority: number): void {
    this.stream.priority = Math.max(1, Math.min(10, priority));
  }

  getMetrics() {
    const serviceMetrics = Array.from(this.services.values()).map(s => ({
      serviceId: s.serviceId,
      name: s.name,
      callsServed: s.callsServed,
      revenue: s.revenue,
      rating: s.rating,
    }));

    return {
      totalEarned: this.stream.totalEarned,
      totalCost: this.stream.totalCost,
      roi: this.stream.roi,
      successRate: this.stream.successRate,
      avgRevenue: this.stream.avgRevenue,
      pendingRequests: this.pendingRequests.length,
      services: serviceMetrics,
      consecutiveFailures: this.stream.consecutiveFailures,
    };
  }

  getServices(): MCPServiceListing[] {
    return Array.from(this.services.values());
  }

  // ==========================================================================
  // Utilities
  // ==========================================================================

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
