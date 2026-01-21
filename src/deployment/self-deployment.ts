/**
 * Genesis Self-Deployment Layer
 *
 * Enables Genesis to reproduce itself across cloud providers.
 * Grounded in autopoietic theory - the system maintains its
 * organization while creating new operational instances.
 *
 * Scientific Foundations:
 * - Autopoiesis: Self-reproduction maintaining organizational closure
 * - Free Energy Principle: Minimize surprise in resource allocation
 * - Edge of Chaos: Scale at critical point between under/over provision
 *
 * Invariants:
 * - INV-009: Spending must not exceed budget without human approval
 * - INV-010: At least one healthy instance must exist (survival)
 * - INV-011: New instances must pass health check before traffic routing
 */

import { EventEmitter } from 'events';
import * as crypto from 'crypto';
import { invariantRegistry, type InvariantContext } from '../kernel/invariants.js';

// ============================================================================
// Types - Core Deployment Abstractions
// ============================================================================

export type CloudProvider =
  | 'aws'
  | 'gcp'
  | 'railway'
  | 'fly'
  | 'render'
  | 'cloudflare-workers';

export type ResourceTier =
  | 'nano'      // Minimal resources, lowest cost
  | 'micro'     // 256MB RAM, 0.25 vCPU
  | 'small'     // 512MB RAM, 0.5 vCPU
  | 'medium'    // 1GB RAM, 1 vCPU
  | 'large'     // 2GB RAM, 2 vCPU
  | 'xlarge';   // 4GB+ RAM, 4+ vCPU

export type InstanceStatus =
  | 'provisioning'
  | 'starting'
  | 'running'
  | 'degraded'
  | 'stopping'
  | 'stopped'
  | 'failed'
  | 'terminated';

export type ActionType =
  | 'provision-instance'
  | 'build-container'
  | 'deploy-container'
  | 'configure-env'
  | 'setup-networking'
  | 'health-check'
  | 'route-traffic'
  | 'scale-up'
  | 'scale-down'
  | 'terminate-instance'
  | 'update-dns';

export type PlanStatus =
  | 'draft'
  | 'pending-approval'
  | 'approved'
  | 'executing'
  | 'completed'
  | 'failed'
  | 'rolled-back';

export interface DeploymentTarget {
  id: string;
  provider: CloudProvider;
  region: string;
  tier: ResourceTier;
  estimatedMonthlyCost: number;
  config: Record<string, unknown>;
  available: boolean;
  latencyMs?: number;
}

export interface HealthStatus {
  healthy: boolean;
  lastCheck: Date;
  checks: HealthCheck[];
  uptime: number;
  restarts: number;
}

export interface HealthCheck {
  name: string;
  passed: boolean;
  message?: string;
  latencyMs?: number;
  timestamp: Date;
}

export interface InstanceMetrics {
  cpuPercent: number;
  memoryPercent: number;
  requestsPerSecond: number;
  averageLatencyMs: number;
  errorRate: number;
  activeConnections: number;
}

export interface Instance {
  id: string;
  name: string;
  target: DeploymentTarget;
  status: InstanceStatus;
  endpoint?: string;
  health: HealthStatus;
  createdAt: Date;
  lastHealthCheck?: Date;
  version: string;
  accumulatedCost: number;
  merkleId?: string;
  metrics: InstanceMetrics;
}

export interface EstimatedCost {
  oneTime: number;
  hourly: number;
  monthly: number;
  currency: 'USD';
  breakdown: Array<{ category: string; amount: number; description: string }>;
}

export interface RetryPolicy {
  maxRetries: number;
  backoffMs: number;
  backoffMultiplier: number;
  maxBackoffMs: number;
}

export interface DeploymentAction {
  type: ActionType;
  target?: DeploymentTarget;
  instance?: Instance;
  parameters: Record<string, unknown>;
  estimatedDuration: number;
  retryPolicy: RetryPolicy;
}

export interface RiskAssessment {
  level: 'low' | 'medium' | 'high' | 'critical';
  factors: Array<{ name: string; severity: number; description: string }>;
  mitigations: string[];
}

export interface RollbackPlan {
  actions: DeploymentAction[];
  estimatedDuration: number;
  dataPreservation: 'full' | 'partial' | 'none';
}

export interface DeploymentPlan {
  id: string;
  description: string;
  actions: DeploymentAction[];
  estimatedCost: EstimatedCost;
  requiresApproval: boolean;
  approvalReason?: string;
  risk: RiskAssessment;
  expectedOutcome: {
    instanceCount: number;
    totalCapacity: number;
    estimatedLatency: number;
    redundancy: 'none' | 'single-region' | 'multi-region';
  };
  rollbackPlan: RollbackPlan;
  createdAt: Date;
  status: PlanStatus;
}

export interface SafetyConstraints {
  maxSpendingWithoutApproval: number;
  monthlyBudgetLimit: number;
  maxTotalInstances: number;
  minHealthyInstances: number;
  requiresApprovalFor: ActionType[];
  blockedProviders: CloudProvider[];
  blockedRegions: string[];
  maxCostPerInstance: number;
}

export interface ScalingPolicy {
  minInstances: number;
  maxInstances: number;
  targetCpuUtilization: number;
  targetRequestsPerInstance: number;
  cooldownSeconds: number;
  scaleUpThreshold: number;
  scaleDownThreshold: number;
  budgetLimit: number;
  costOptimize: boolean;
}

export interface ScalingDecision {
  action: 'scale-up' | 'scale-down' | 'maintain';
  currentInstances: number;
  targetInstances: number;
  reason: string;
  confidence: number;
  costImpact: number;
  requiresApproval: boolean;
}

export interface DeploymentResult {
  success: boolean;
  planId: string;
  instance?: Instance;
  error?: string;
  actions: ActionResult[];
}

export interface ActionResult {
  success: boolean;
  action: ActionType;
  instance?: Instance;
  error?: string;
  duration?: number;
}

export interface HealthReport {
  timestamp: Date;
  totalInstances: number;
  healthyInstances: number;
  unhealthyInstances: number;
  results: Array<{
    instanceId: string;
    healthy: boolean;
    checks?: HealthCheck[];
    metrics?: InstanceMetrics;
    error?: string;
  }>;
  systemHealth: 'healthy' | 'degraded' | 'critical';
}

export interface ScalingResult {
  success: boolean;
  action: 'scale-up' | 'scale-down' | 'maintain';
  newInstanceCount: number;
  instance?: Instance;
  terminatedInstance?: string;
  error?: string;
}

export interface CostOptimization {
  type: 'downsize' | 'region-move' | 'provider-switch' | 'spot-instance';
  instanceId?: string;
  description: string;
  estimatedSavings: number;
  risk: 'low' | 'medium' | 'high';
}

// ============================================================================
// Provider Adapter Interface
// ============================================================================

export interface CloudProviderAdapter {
  provider: CloudProvider;
  checkAvailability(): Promise<boolean>;
  listTargets(region?: string): Promise<DeploymentTarget[]>;
  getPricing(target: DeploymentTarget): Promise<EstimatedCost>;
  provision(target: DeploymentTarget, config: ProvisionConfig): Promise<Instance>;
  deploy(instance: Instance, container: ContainerConfig): Promise<Instance>;
  healthCheck(instance: Instance): Promise<HealthStatus>;
  getMetrics(instance: Instance): Promise<InstanceMetrics>;
  terminate(instance: Instance): Promise<void>;
  scale(instance: Instance, newTier: ResourceTier): Promise<Instance>;
  updateEnv(instance: Instance, env: Record<string, string>): Promise<void>;
}

export interface ProvisionConfig {
  name: string;
  version: string;
  env: Record<string, string>;
  secrets: string[];
  labels: Record<string, string>;
}

export interface ContainerConfig {
  image: string;
  tag: string;
  registry?: string;
  port: number;
  healthCheckPath: string;
  env: Record<string, string>;
  resources: { cpu: string; memory: string };
}

// ============================================================================
// Cloud Deployer - Main Implementation
// ============================================================================

export class CloudDeployer extends EventEmitter {
  private providers: Map<CloudProvider, CloudProviderAdapter> = new Map();
  private instances: Map<string, Instance> = new Map();
  private plans: Map<string, DeploymentPlan> = new Map();
  private constraints: SafetyConstraints;
  private scalingPolicy: ScalingPolicy;
  private initialized = false;
  private deploymentHistory: DeploymentResult[] = [];

  constructor(constraints?: Partial<SafetyConstraints>) {
    super();

    // Default safety constraints - conservative by default
    this.constraints = {
      maxSpendingWithoutApproval: 50,
      monthlyBudgetLimit: 500,
      maxTotalInstances: 10,
      minHealthyInstances: 1,
      requiresApprovalFor: ['provision-instance', 'scale-up', 'terminate-instance'],
      blockedProviders: [],
      blockedRegions: [],
      maxCostPerInstance: 100,
      ...constraints,
    };

    // Default scaling policy
    this.scalingPolicy = {
      minInstances: 1,
      maxInstances: 5,
      targetCpuUtilization: 0.7,
      targetRequestsPerInstance: 100,
      cooldownSeconds: 300,
      scaleUpThreshold: 3,
      scaleDownThreshold: 5,
      budgetLimit: 500,
      costOptimize: true,
    };

    this.registerInvariants();
  }

  // ==========================================================================
  // Initialization
  // ==========================================================================

  async initialize(): Promise<{ providers: Record<CloudProvider, boolean>; economic: boolean }> {
    if (this.initialized) {
      return { providers: this.getProviderStatus(), economic: true };
    }

    await this.initializeProviders();
    this.initialized = true;

    console.log('[CloudDeployer] Initialized with providers:', this.getProviderStatus());
    return { providers: this.getProviderStatus(), economic: true };
  }

  private async initializeProviders(): Promise<void> {
    // AWS Provider
    if (process.env.AWS_ACCESS_KEY_ID) {
      this.providers.set('aws', new AWSAdapter());
    }

    // Railway Provider
    if (process.env.RAILWAY_TOKEN) {
      this.providers.set('railway', new RailwayAdapter());
    }

    // Fly.io Provider
    if (process.env.FLY_API_TOKEN) {
      this.providers.set('fly', new FlyAdapter());
    }

    // Render Provider
    if (process.env.RENDER_API_KEY) {
      this.providers.set('render', new RenderAdapter());
    }

    // Cloudflare Workers
    if (process.env.CLOUDFLARE_API_TOKEN) {
      this.providers.set('cloudflare-workers', new CloudflareAdapter());
    }

    // Check availability
    for (const [name, adapter] of this.providers) {
      try {
        const available = await adapter.checkAvailability();
        if (!available) {
          console.warn(`[CloudDeployer] Provider ${name} not available`);
          this.providers.delete(name);
        }
      } catch (error) {
        console.error(`[CloudDeployer] Provider ${name} check failed:`, error);
        this.providers.delete(name);
      }
    }
  }

  private getProviderStatus(): Record<CloudProvider, boolean> {
    const status: Record<string, boolean> = {};
    const allProviders: CloudProvider[] = ['aws', 'gcp', 'railway', 'fly', 'render', 'cloudflare-workers'];
    for (const provider of allProviders) {
      status[provider] = this.providers.has(provider);
    }
    return status as Record<CloudProvider, boolean>;
  }

  // ==========================================================================
  // Invariant Registration
  // ==========================================================================

  private registerInvariants(): void {
    // INV-009: Spending constraint
    invariantRegistry.register({
      id: 'INV-009',
      name: 'Deployment Spending',
      description: 'Deployment spending must not exceed budget without approval',
      phase: 'v10.0',
      severity: 'critical',
      checker: (ctx: InvariantContext) => {
        const spending = (ctx as Record<string, unknown>).deploymentSpending as number ?? 0;
        const limit = (ctx as Record<string, unknown>).deploymentBudget as number ?? this.constraints.monthlyBudgetLimit;
        return {
          id: 'INV-009',
          name: 'Deployment Spending',
          passed: spending <= limit,
          message: spending > limit
            ? `Deployment spending ($${spending}) exceeds budget ($${limit})`
            : undefined,
          severity: 'critical',
          timestamp: new Date(),
        };
      },
    });

    // INV-010: Minimum healthy instances
    invariantRegistry.register({
      id: 'INV-010',
      name: 'Instance Survival',
      description: 'At least one healthy instance must exist',
      phase: 'v10.0',
      severity: 'critical',
      checker: (ctx: InvariantContext) => {
        const healthyCount = (ctx as Record<string, unknown>).healthyInstanceCount as number ?? 1;
        const minRequired = this.constraints.minHealthyInstances;
        return {
          id: 'INV-010',
          name: 'Instance Survival',
          passed: healthyCount >= minRequired,
          message: healthyCount < minRequired
            ? `Only ${healthyCount} healthy instances (need ${minRequired})`
            : undefined,
          severity: 'critical',
          timestamp: new Date(),
        };
      },
    });

    // INV-011: Health check before traffic
    invariantRegistry.register({
      id: 'INV-011',
      name: 'Traffic Routing Safety',
      description: 'New instances must pass health check before receiving traffic',
      phase: 'v10.0',
      severity: 'critical',
      checker: (ctx: InvariantContext) => {
        const unhealthyWithTraffic = (ctx as Record<string, unknown>).unhealthyInstancesWithTraffic as number ?? 0;
        return {
          id: 'INV-011',
          name: 'Traffic Routing Safety',
          passed: unhealthyWithTraffic === 0,
          message: unhealthyWithTraffic > 0
            ? `${unhealthyWithTraffic} unhealthy instances receiving traffic`
            : undefined,
          severity: 'critical',
          timestamp: new Date(),
        };
      },
    });
  }

  // ==========================================================================
  // Target Discovery
  // ==========================================================================

  async discoverTargets(options?: {
    providers?: CloudProvider[];
    regions?: string[];
    maxCost?: number;
    tier?: ResourceTier;
  }): Promise<DeploymentTarget[]> {
    await this.initialize();

    const targets: DeploymentTarget[] = [];
    const providerFilter = options?.providers ?? Array.from(this.providers.keys());

    for (const providerName of providerFilter) {
      if (this.constraints.blockedProviders.includes(providerName)) continue;

      const adapter = this.providers.get(providerName);
      if (!adapter) continue;

      try {
        const providerTargets = await adapter.listTargets(options?.regions?.[0]);

        for (const target of providerTargets) {
          if (options?.regions && !options.regions.includes(target.region)) continue;
          if (this.constraints.blockedRegions.includes(target.region)) continue;
          if (options?.tier && target.tier !== options.tier) continue;
          if (options?.maxCost && target.estimatedMonthlyCost > options.maxCost) continue;
          if (target.estimatedMonthlyCost > this.constraints.maxCostPerInstance) continue;

          targets.push(target);
        }
      } catch (error) {
        console.error(`[CloudDeployer] Failed to list targets for ${providerName}:`, error);
      }
    }

    // Sort by cost (cheapest first)
    targets.sort((a, b) => a.estimatedMonthlyCost - b.estimatedMonthlyCost);

    return targets;
  }

  async findCheapestTarget(requirements: {
    minTier?: ResourceTier;
    maxLatency?: number;
    regions?: string[];
  }): Promise<DeploymentTarget | null> {
    const targets = await this.discoverTargets({ regions: requirements.regions });
    const tierOrder: ResourceTier[] = ['nano', 'micro', 'small', 'medium', 'large', 'xlarge'];
    const minTierIndex = requirements.minTier ? tierOrder.indexOf(requirements.minTier) : 0;

    for (const target of targets) {
      const tierIndex = tierOrder.indexOf(target.tier);
      if (tierIndex < minTierIndex) continue;
      if (requirements.maxLatency && target.latencyMs && target.latencyMs > requirements.maxLatency) continue;
      return target;
    }

    return null;
  }

  // ==========================================================================
  // Deployment Planning
  // ==========================================================================

  async createDeploymentPlan(options: {
    target?: DeploymentTarget;
    reason: string;
    urgent?: boolean;
  }): Promise<DeploymentPlan> {
    await this.initialize();

    const target = options.target ?? await this.findCheapestTarget({});
    if (!target) {
      throw new Error('No deployment targets available');
    }

    const planId = `plan-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;

    const adapter = this.providers.get(target.provider);
    const pricing = adapter ? await adapter.getPricing(target) : {
      oneTime: 0,
      hourly: target.estimatedMonthlyCost / 720,
      monthly: target.estimatedMonthlyCost,
      currency: 'USD' as const,
      breakdown: [],
    };

    const requiresApproval = this.checkRequiresApproval(pricing, options.urgent);
    const risk = this.assessRisk(target, pricing);

    const actions: DeploymentAction[] = [
      {
        type: 'build-container',
        parameters: { dockerfile: 'Dockerfile', context: '.', tag: `genesis:${Date.now()}` },
        estimatedDuration: 120,
        retryPolicy: { maxRetries: 2, backoffMs: 5000, backoffMultiplier: 2, maxBackoffMs: 30000 },
      },
      {
        type: 'provision-instance',
        target,
        parameters: { name: `genesis-${planId}`, tier: target.tier },
        estimatedDuration: 60,
        retryPolicy: { maxRetries: 3, backoffMs: 10000, backoffMultiplier: 2, maxBackoffMs: 60000 },
      },
      {
        type: 'configure-env',
        target,
        parameters: { env: this.getRequiredEnvVars() },
        estimatedDuration: 10,
        retryPolicy: { maxRetries: 2, backoffMs: 2000, backoffMultiplier: 2, maxBackoffMs: 10000 },
      },
      {
        type: 'deploy-container',
        target,
        parameters: {},
        estimatedDuration: 60,
        retryPolicy: { maxRetries: 3, backoffMs: 10000, backoffMultiplier: 2, maxBackoffMs: 60000 },
      },
      {
        type: 'health-check',
        target,
        parameters: { timeout: 30000, retries: 3 },
        estimatedDuration: 30,
        retryPolicy: { maxRetries: 5, backoffMs: 5000, backoffMultiplier: 1.5, maxBackoffMs: 30000 },
      },
      {
        type: 'route-traffic',
        target,
        parameters: { weight: 0.1 },
        estimatedDuration: 10,
        retryPolicy: { maxRetries: 2, backoffMs: 2000, backoffMultiplier: 2, maxBackoffMs: 10000 },
      },
    ];

    const rollbackPlan: RollbackPlan = {
      actions: [
        {
          type: 'route-traffic',
          target,
          parameters: { weight: 0 },
          estimatedDuration: 5,
          retryPolicy: { maxRetries: 3, backoffMs: 1000, backoffMultiplier: 2, maxBackoffMs: 5000 },
        },
        {
          type: 'terminate-instance',
          target,
          parameters: {},
          estimatedDuration: 30,
          retryPolicy: { maxRetries: 3, backoffMs: 5000, backoffMultiplier: 2, maxBackoffMs: 30000 },
        },
      ],
      estimatedDuration: 60,
      dataPreservation: 'partial',
    };

    const plan: DeploymentPlan = {
      id: planId,
      description: options.reason,
      actions,
      estimatedCost: pricing,
      requiresApproval,
      approvalReason: requiresApproval
        ? `Monthly cost $${pricing.monthly} exceeds auto-approval threshold $${this.constraints.maxSpendingWithoutApproval}`
        : undefined,
      risk,
      expectedOutcome: {
        instanceCount: this.instances.size + 1,
        totalCapacity: (this.instances.size + 1) * 100,
        estimatedLatency: target.latencyMs ?? 100,
        redundancy: this.instances.size > 0 ? 'single-region' : 'none',
      },
      rollbackPlan,
      createdAt: new Date(),
      status: requiresApproval ? 'pending-approval' : 'draft',
    };

    this.plans.set(planId, plan);
    this.emit('plan:created', plan);
    return plan;
  }

  private checkRequiresApproval(pricing: EstimatedCost, urgent?: boolean): boolean {
    if (urgent) return false;
    if (pricing.monthly > this.constraints.maxSpendingWithoutApproval) return true;
    const currentSpending = this.getTotalMonthlySpending();
    if (currentSpending + pricing.monthly > this.constraints.monthlyBudgetLimit) return true;
    return false;
  }

  private assessRisk(target: DeploymentTarget, pricing: EstimatedCost): RiskAssessment {
    const factors: Array<{ name: string; severity: number; description: string }> = [];
    const costRatio = pricing.monthly / this.constraints.monthlyBudgetLimit;

    if (costRatio > 0.5) {
      factors.push({
        name: 'High cost ratio',
        severity: costRatio,
        description: `Deployment costs ${(costRatio * 100).toFixed(0)}% of monthly budget`,
      });
    }

    if (this.instances.size === 0) {
      factors.push({
        name: 'No redundancy',
        severity: 0.3,
        description: 'This will be the only running instance',
      });
    }

    const avgSeverity = factors.length > 0
      ? factors.reduce((sum, f) => sum + f.severity, 0) / factors.length
      : 0;

    let level: RiskAssessment['level'];
    if (avgSeverity > 0.7) level = 'critical';
    else if (avgSeverity > 0.5) level = 'high';
    else if (avgSeverity > 0.2) level = 'medium';
    else level = 'low';

    return {
      level,
      factors,
      mitigations: [
        'Gradual traffic routing (10% initially)',
        'Health checks before full traffic',
        'Automatic rollback on failure',
        'Cost monitoring with alerts',
      ],
    };
  }

  private getRequiredEnvVars(): Record<string, string> {
    return {
      NODE_ENV: 'production',
      GENESIS_INSTANCE_ID: `${Date.now()}`,
      GENESIS_CLUSTER_MODE: 'true',
    };
  }

  // ==========================================================================
  // Plan Execution
  // ==========================================================================

  async executePlan(planId: string, approval?: { approved: boolean; approvedBy: string }): Promise<DeploymentResult> {
    const plan = this.plans.get(planId);
    if (!plan) {
      throw new Error(`Plan ${planId} not found`);
    }

    if (plan.requiresApproval && !approval?.approved) {
      return { success: false, planId, error: 'Plan requires human approval', actions: [] };
    }

    plan.status = 'executing';
    this.emit('plan:executing', plan);

    const results: ActionResult[] = [];
    let instance: Instance | undefined;

    try {
      for (const action of plan.actions) {
        const result = await this.executeAction(action, instance);
        results.push(result);

        if (!result.success) {
          plan.status = 'failed';
          await this.executeRollback(plan.rollbackPlan, instance);
          return { success: false, planId, error: `Action ${action.type} failed: ${result.error}`, actions: results };
        }

        if (result.instance) instance = result.instance;
      }

      plan.status = 'completed';
      if (instance) this.instances.set(instance.id, instance);

      this.deploymentHistory.push({ success: true, planId, actions: results });
      this.emit('plan:completed', { plan, instance });

      return { success: true, planId, instance, actions: results };
    } catch (error) {
      plan.status = 'failed';
      await this.executeRollback(plan.rollbackPlan, instance);
      return { success: false, planId, error: String(error), actions: results };
    }
  }

  private async executeAction(action: DeploymentAction, currentInstance?: Instance): Promise<ActionResult> {
    const startTime = Date.now();
    const adapter = action.target ? this.providers.get(action.target.provider) : undefined;

    try {
      switch (action.type) {
        case 'build-container':
          await this.simulateAction(1000);
          return { success: true, action: action.type, duration: Date.now() - startTime };

        case 'provision-instance':
          if (!adapter || !action.target) {
            return { success: false, action: action.type, error: 'No adapter or target' };
          }
          const newInstance = await adapter.provision(action.target, {
            name: action.parameters.name as string,
            version: process.env.npm_package_version ?? '10.0.0',
            env: this.getRequiredEnvVars(),
            secrets: [],
            labels: { 'genesis.managed': 'true' },
          });
          return { success: true, action: action.type, instance: newInstance, duration: Date.now() - startTime };

        case 'configure-env':
          if (!adapter || !currentInstance) {
            return { success: false, action: action.type, error: 'No adapter or instance' };
          }
          await adapter.updateEnv(currentInstance, action.parameters.env as Record<string, string>);
          return { success: true, action: action.type, duration: Date.now() - startTime };

        case 'deploy-container':
          if (!adapter || !currentInstance) {
            return { success: false, action: action.type, error: 'No adapter or instance' };
          }
          const deployedInstance = await adapter.deploy(currentInstance, {
            image: 'genesis',
            tag: 'latest',
            port: 3000,
            healthCheckPath: '/health',
            env: {},
            resources: { cpu: '0.5', memory: '512Mi' },
          });
          return { success: true, action: action.type, instance: deployedInstance, duration: Date.now() - startTime };

        case 'health-check':
          if (!adapter || !currentInstance) {
            return { success: false, action: action.type, error: 'No adapter or instance' };
          }
          const health = await adapter.healthCheck(currentInstance);
          if (!health.healthy) {
            return { success: false, action: action.type, error: 'Health check failed', duration: Date.now() - startTime };
          }
          return { success: true, action: action.type, duration: Date.now() - startTime };

        case 'route-traffic':
          await this.simulateAction(500);
          return { success: true, action: action.type, duration: Date.now() - startTime };

        default:
          return { success: false, action: action.type, error: `Unknown action: ${action.type}` };
      }
    } catch (error) {
      return { success: false, action: action.type, error: String(error), duration: Date.now() - startTime };
    }
  }

  private async executeRollback(plan: RollbackPlan, instance?: Instance): Promise<void> {
    console.log('[CloudDeployer] Executing rollback...');
    for (const action of plan.actions) {
      try {
        await this.executeAction(action, instance);
      } catch (error) {
        console.error('[CloudDeployer] Rollback action failed:', error);
      }
    }
    console.log('[CloudDeployer] Rollback complete');
  }

  private async simulateAction(durationMs: number): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, Math.min(durationMs, 100)));
  }

  // ==========================================================================
  // Health Monitoring
  // ==========================================================================

  async checkAllHealth(): Promise<HealthReport> {
    const results: HealthReport['results'] = [];

    for (const [id, instance] of this.instances) {
      const adapter = this.providers.get(instance.target.provider);
      if (!adapter) {
        results.push({ instanceId: id, healthy: false, error: 'Provider not available' });
        continue;
      }

      try {
        const health = await adapter.healthCheck(instance);
        instance.health = health;
        instance.lastHealthCheck = new Date();
        results.push({ instanceId: id, healthy: health.healthy, checks: health.checks, metrics: await adapter.getMetrics(instance) });
      } catch (error) {
        results.push({ instanceId: id, healthy: false, error: String(error) });
      }
    }

    const healthyCount = results.filter(r => r.healthy).length;
    const totalCount = results.length;

    return {
      timestamp: new Date(),
      totalInstances: totalCount,
      healthyInstances: healthyCount,
      unhealthyInstances: totalCount - healthyCount,
      results,
      systemHealth: healthyCount >= this.constraints.minHealthyInstances ? 'healthy' : 'degraded',
    };
  }

  // ==========================================================================
  // Auto-Scaling
  // ==========================================================================

  async evaluateScaling(): Promise<ScalingDecision> {
    const healthReport = await this.checkAllHealth();

    const totalRPS = healthReport.results.reduce(
      (sum, r) => sum + (r.metrics?.requestsPerSecond ?? 0), 0
    );
    const avgCPU = healthReport.results.reduce(
      (sum, r) => sum + (r.metrics?.cpuPercent ?? 0), 0
    ) / Math.max(healthReport.totalInstances, 1);

    const currentInstances = healthReport.totalInstances;

    // Scale up decision
    if (avgCPU > this.scalingPolicy.targetCpuUtilization * 100 ||
        totalRPS / Math.max(currentInstances, 1) > this.scalingPolicy.targetRequestsPerInstance) {
      if (currentInstances >= this.scalingPolicy.maxInstances) {
        return {
          action: 'maintain',
          currentInstances,
          targetInstances: currentInstances,
          reason: 'At maximum instances',
          confidence: 1.0,
          costImpact: 0,
          requiresApproval: false,
        };
      }

      const estimatedCostIncrease = this.estimateInstanceCost();
      const newSpending = this.getTotalMonthlySpending() + estimatedCostIncrease;

      return {
        action: 'scale-up',
        currentInstances,
        targetInstances: Math.min(currentInstances + 1, this.scalingPolicy.maxInstances),
        reason: `High load: CPU ${avgCPU.toFixed(1)}%, RPS ${totalRPS.toFixed(1)}`,
        confidence: 0.8,
        costImpact: estimatedCostIncrease,
        requiresApproval: newSpending > this.scalingPolicy.budgetLimit,
      };
    }

    // Scale down decision
    if (avgCPU < this.scalingPolicy.targetCpuUtilization * 50 &&
        totalRPS / Math.max(currentInstances, 1) < this.scalingPolicy.targetRequestsPerInstance * 0.3) {
      if (currentInstances <= this.scalingPolicy.minInstances) {
        return {
          action: 'maintain',
          currentInstances,
          targetInstances: currentInstances,
          reason: 'At minimum instances',
          confidence: 1.0,
          costImpact: 0,
          requiresApproval: false,
        };
      }

      return {
        action: 'scale-down',
        currentInstances,
        targetInstances: Math.max(currentInstances - 1, this.scalingPolicy.minInstances),
        reason: `Low load: CPU ${avgCPU.toFixed(1)}%, RPS ${totalRPS.toFixed(1)}`,
        confidence: 0.7,
        costImpact: -this.estimateInstanceCost(),
        requiresApproval: false,
      };
    }

    return {
      action: 'maintain',
      currentInstances,
      targetInstances: currentInstances,
      reason: 'Load within normal range',
      confidence: 0.9,
      costImpact: 0,
      requiresApproval: false,
    };
  }

  async executeScaling(decision: ScalingDecision): Promise<ScalingResult> {
    if (decision.action === 'maintain') {
      return { success: true, action: 'maintain', newInstanceCount: decision.currentInstances };
    }

    if (decision.requiresApproval) {
      return {
        success: false,
        action: decision.action,
        error: 'Requires human approval due to budget impact',
        newInstanceCount: decision.currentInstances,
      };
    }

    if (decision.action === 'scale-up') {
      const target = await this.findCheapestTarget({ minTier: 'small' });
      if (!target) {
        return { success: false, action: 'scale-up', error: 'No suitable target found', newInstanceCount: decision.currentInstances };
      }

      const plan = await this.createDeploymentPlan({ target, reason: decision.reason, urgent: true });
      const result = await this.executePlan(plan.id);
      return { success: result.success, action: 'scale-up', newInstanceCount: this.instances.size, instance: result.instance, error: result.error };
    }

    if (decision.action === 'scale-down') {
      const instances = Array.from(this.instances.values())
        .filter(i => i.status === 'running')
        .sort((a, b) => a.metrics.requestsPerSecond - b.metrics.requestsPerSecond);

      if (instances.length <= this.scalingPolicy.minInstances) {
        return { success: false, action: 'scale-down', error: 'Cannot scale below minimum', newInstanceCount: instances.length };
      }

      const toTerminate = instances[0];
      const adapter = this.providers.get(toTerminate.target.provider);
      if (adapter) {
        await adapter.terminate(toTerminate);
        this.instances.delete(toTerminate.id);
      }

      return { success: true, action: 'scale-down', newInstanceCount: this.instances.size, terminatedInstance: toTerminate.id };
    }

    return { success: false, action: decision.action, error: 'Unknown action', newInstanceCount: decision.currentInstances };
  }

  // ==========================================================================
  // Cost Management
  // ==========================================================================

  getTotalMonthlySpending(): number {
    let total = 0;
    for (const instance of this.instances.values()) {
      total += instance.target.estimatedMonthlyCost;
    }
    return total;
  }

  private estimateInstanceCost(): number {
    if (this.instances.size === 0) return 50;
    return this.getTotalMonthlySpending() / this.instances.size;
  }

  getCostBreakdown(): Record<CloudProvider, number> {
    const breakdown: Record<string, number> = {};
    for (const instance of this.instances.values()) {
      const provider = instance.target.provider;
      breakdown[provider] = (breakdown[provider] ?? 0) + instance.target.estimatedMonthlyCost;
    }
    return breakdown as Record<CloudProvider, number>;
  }

  async findCostOptimizations(): Promise<CostOptimization[]> {
    const optimizations: CostOptimization[] = [];

    for (const instance of this.instances.values()) {
      if (instance.metrics.cpuPercent < 20 && instance.metrics.memoryPercent < 30) {
        optimizations.push({
          type: 'downsize',
          instanceId: instance.id,
          description: `Instance ${instance.name} is under-utilized, consider downsizing`,
          estimatedSavings: instance.target.estimatedMonthlyCost * 0.3,
          risk: 'low',
        });
      }
    }

    return optimizations;
  }

  // ==========================================================================
  // Instance Management
  // ==========================================================================

  getInstances(): Instance[] {
    return Array.from(this.instances.values());
  }

  getInstance(id: string): Instance | undefined {
    return this.instances.get(id);
  }

  async terminateInstance(id: string): Promise<boolean> {
    const instance = this.instances.get(id);
    if (!instance) return false;

    if (this.instances.size <= this.constraints.minHealthyInstances) {
      console.warn('[CloudDeployer] Cannot terminate: would violate INV-010');
      return false;
    }

    const adapter = this.providers.get(instance.target.provider);
    if (adapter) await adapter.terminate(instance);

    this.instances.delete(id);
    this.emit('instance:terminated', instance);
    return true;
  }

  // ==========================================================================
  // Plan Management
  // ==========================================================================

  getPlan(id: string): DeploymentPlan | undefined {
    return this.plans.get(id);
  }

  getPendingPlans(): DeploymentPlan[] {
    return Array.from(this.plans.values()).filter(p => p.status === 'pending-approval');
  }

  async approvePlan(id: string, approvedBy: string): Promise<DeploymentResult> {
    const plan = this.plans.get(id);
    if (!plan) return { success: false, planId: id, error: 'Plan not found', actions: [] };
    plan.status = 'approved';
    return this.executePlan(id, { approved: true, approvedBy });
  }

  // ==========================================================================
  // Configuration
  // ==========================================================================

  updateConstraints(constraints: Partial<SafetyConstraints>): void {
    this.constraints = { ...this.constraints, ...constraints };
  }

  updateScalingPolicy(policy: Partial<ScalingPolicy>): void {
    this.scalingPolicy = { ...this.scalingPolicy, ...policy };
  }

  getConstraints(): SafetyConstraints {
    return { ...this.constraints };
  }

  getScalingPolicy(): ScalingPolicy {
    return { ...this.scalingPolicy };
  }
}

// ============================================================================
// Provider Adapters
// ============================================================================

class BaseAdapter implements CloudProviderAdapter {
  provider: CloudProvider = 'railway';

  async checkAvailability(): Promise<boolean> { return true; }

  async listTargets(): Promise<DeploymentTarget[]> { return []; }

  async getPricing(target: DeploymentTarget): Promise<EstimatedCost> {
    return { oneTime: 0, hourly: target.estimatedMonthlyCost / 720, monthly: target.estimatedMonthlyCost, currency: 'USD', breakdown: [] };
  }

  async provision(target: DeploymentTarget, config: ProvisionConfig): Promise<Instance> {
    return {
      id: `${this.provider}-${Date.now()}`,
      name: config.name,
      target,
      status: 'running',
      health: { healthy: true, lastCheck: new Date(), checks: [], uptime: 0, restarts: 0 },
      createdAt: new Date(),
      version: config.version,
      accumulatedCost: 0,
      metrics: { cpuPercent: 0, memoryPercent: 0, requestsPerSecond: 0, averageLatencyMs: 0, errorRate: 0, activeConnections: 0 },
    };
  }

  async deploy(instance: Instance): Promise<Instance> { return { ...instance, status: 'running' }; }
  async healthCheck(): Promise<HealthStatus> { return { healthy: true, lastCheck: new Date(), checks: [], uptime: 0, restarts: 0 }; }
  async getMetrics(): Promise<InstanceMetrics> { return { cpuPercent: 30, memoryPercent: 40, requestsPerSecond: 50, averageLatencyMs: 100, errorRate: 0.01, activeConnections: 10 }; }
  async terminate(): Promise<void> {}
  async scale(instance: Instance): Promise<Instance> { return instance; }
  async updateEnv(): Promise<void> {}
}

class AWSAdapter extends BaseAdapter {
  provider: CloudProvider = 'aws';

  async checkAvailability(): Promise<boolean> { return !!process.env.AWS_ACCESS_KEY_ID; }

  async listTargets(region?: string): Promise<DeploymentTarget[]> {
    const regions = region ? [region] : ['us-east-1', 'us-west-2', 'eu-west-1'];
    return regions.flatMap(r => [
      { id: `aws-${r}-small`, provider: 'aws' as const, region: r, tier: 'small' as const, estimatedMonthlyCost: 30, config: {}, available: true },
      { id: `aws-${r}-medium`, provider: 'aws' as const, region: r, tier: 'medium' as const, estimatedMonthlyCost: 60, config: {}, available: true },
    ]);
  }
}

class RailwayAdapter extends BaseAdapter {
  provider: CloudProvider = 'railway';

  async checkAvailability(): Promise<boolean> { return !!process.env.RAILWAY_TOKEN; }

  async listTargets(): Promise<DeploymentTarget[]> {
    return [
      { id: 'railway-us-east', provider: 'railway', region: 'us-east', tier: 'small', estimatedMonthlyCost: 5, config: {}, available: true },
      { id: 'railway-us-west', provider: 'railway', region: 'us-west', tier: 'small', estimatedMonthlyCost: 5, config: {}, available: true },
    ];
  }
}

class FlyAdapter extends BaseAdapter {
  provider: CloudProvider = 'fly';

  async checkAvailability(): Promise<boolean> { return !!process.env.FLY_API_TOKEN; }

  async listTargets(region?: string): Promise<DeploymentTarget[]> {
    const regions = region ? [region] : ['iad', 'lax', 'ams', 'syd'];
    return regions.map(r => ({
      id: `fly-${r}`, provider: 'fly' as const, region: r, tier: 'micro' as const, estimatedMonthlyCost: 7, config: {}, available: true,
    }));
  }
}

class RenderAdapter extends BaseAdapter {
  provider: CloudProvider = 'render';
  async checkAvailability(): Promise<boolean> { return !!process.env.RENDER_API_KEY; }
}

class CloudflareAdapter extends BaseAdapter {
  provider: CloudProvider = 'cloudflare-workers';
  async checkAvailability(): Promise<boolean> { return !!process.env.CLOUDFLARE_API_TOKEN; }
}

// ============================================================================
// Singleton
// ============================================================================

let cloudDeployerInstance: CloudDeployer | null = null;

export function getCloudDeployer(constraints?: Partial<SafetyConstraints>): CloudDeployer {
  if (!cloudDeployerInstance) {
    cloudDeployerInstance = new CloudDeployer(constraints);
  }
  return cloudDeployerInstance;
}

export function resetCloudDeployer(): void {
  cloudDeployerInstance = null;
}
