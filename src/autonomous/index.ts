/**
 * Genesis Autonomous System - Unified Integration
 *
 * Combines all layers into a single autonomous operating system:
 * - Economic Layer: Self-funding via payments, crypto, micropayments
 * - Deployment Layer: Self-deployment via Vercel, Supabase, Cloudflare
 * - Memory Layer: Production-grade persistent memory
 * - Governance Layer: A2A protocol, safety controls, HITL
 *
 * This is the "brain" that orchestrates all subsystems for true autonomy.
 */

import { EventEmitter } from 'events';
import { createPublisher } from '../bus/index.js';
import { getEconomicSystem, EconomicSystem, TreasuryBalance } from '../economy';
import { getDeploymentSystem, DeploymentSystem, WebsiteConfig, DeploymentResult } from '../deployment';
import { getProductionMemory, ProductionMemory, MemoryEntry, SearchResult } from '../memory-production';
import { getGovernanceSystem, GovernanceSystem, AgentCard, ApprovalRequest } from '../governance';

// ============================================================================
// Types
// ============================================================================

export interface AutonomousConfig {
  enableEconomy?: boolean;
  enableDeployment?: boolean;
  enableProductionMemory?: boolean;
  enableGovernance?: boolean;
  embeddingFn?: (text: string) => Promise<number[]>;
  slackWebhook?: string;
  budgetLimits?: {
    dailyUSD?: number;
    perTransactionUSD?: number;
    monthlyUSD?: number;
  };
}

export interface AutonomousStatus {
  initialized: boolean;
  subsystems: {
    economy: { enabled: boolean; connected: boolean; balance?: TreasuryBalance };
    deployment: { enabled: boolean; connected: { vercel: boolean; supabase: boolean; cloudflare: boolean } };
    memory: { enabled: boolean; connected: { vectors: boolean; graph: boolean; structured: boolean } };
    governance: { enabled: boolean; stats: ReturnType<GovernanceSystem['getStatus']> };
  };
  health: 'healthy' | 'degraded' | 'critical';
  pendingActions: number;
  lastActivity: string;
}

export interface AutonomousTask {
  id: string;
  type: 'earn' | 'deploy' | 'remember' | 'collaborate' | 'custom';
  description: string;
  priority: 'low' | 'normal' | 'high' | 'critical';
  status: 'queued' | 'running' | 'completed' | 'failed' | 'blocked';
  created: string;
  started?: string;
  completed?: string;
  result?: unknown;
  error?: string;
  governanceApproval?: string;
}

// ============================================================================
// Autonomous System
// ============================================================================

export class AutonomousSystem extends EventEmitter {
  private config: AutonomousConfig;
  private economy: EconomicSystem | null = null;
  private deployment: DeploymentSystem | null = null;
  private memory: ProductionMemory | null = null;
  private governance: GovernanceSystem | null = null;

  private taskQueue: AutonomousTask[] = [];
  private runningTasks: Map<string, AutonomousTask> = new Map();
  private initialized = false;
  private lastActivity = new Date().toISOString();

  constructor(config: AutonomousConfig = {}) {
    super();
    this.config = {
      enableEconomy: true,
      enableDeployment: true,
      enableProductionMemory: true,
      enableGovernance: true,
      ...config,
    };
  }

  /**
   * Initialize all subsystems
   */
  async initialize(): Promise<AutonomousStatus> {
    console.log('[AutonomousSystem] Initializing...');

    // Initialize subsystems based on config
    if (this.config.enableEconomy) {
      this.economy = getEconomicSystem();
    }

    if (this.config.enableDeployment) {
      this.deployment = getDeploymentSystem();
      await this.deployment.initialize();
    }

    if (this.config.enableProductionMemory) {
      this.memory = getProductionMemory();
      if (this.config.embeddingFn) {
        this.memory.setEmbeddingFunction(this.config.embeddingFn);
      }
      await this.memory.initialize();
    }

    if (this.config.enableGovernance) {
      this.governance = getGovernanceSystem();
      if (this.config.slackWebhook) {
        this.governance.setSlackNotifications(this.config.slackWebhook);
      }
      // Set budget rules from config
      if (this.config.budgetLimits?.dailyUSD) {
        this.governance.governance.setRule({
          id: 'custom-daily-limit',
          name: 'Custom Daily Limit',
          description: `Daily spending limit: $${this.config.budgetLimits.dailyUSD}`,
          type: 'budget',
          condition: `dailySpending > ${this.config.budgetLimits.dailyUSD}`,
          action: 'require-approval',
          priority: 100,
          enabled: true,
        });
      }
    }

    this.initialized = true;
    this.lastActivity = new Date().toISOString();

    const status = await this.getStatus();
    console.log('[AutonomousSystem] Initialized. Health:', status.health);

    // v14.1: Emit initialized event
    this.emit('initialized', { health: status.health, pendingActions: status.pendingActions });

    return status;
  }

  /**
   * Get current system status
   */
  async getStatus(): Promise<AutonomousStatus> {
    const status: AutonomousStatus = {
      initialized: this.initialized,
      subsystems: {
        economy: {
          enabled: !!this.economy,
          connected: !!this.economy,
          balance: this.economy ? await this.economy.getUnifiedBalance() : undefined,
        },
        deployment: {
          enabled: !!this.deployment,
          connected: { vercel: false, supabase: false, cloudflare: false },
        },
        memory: {
          enabled: !!this.memory,
          connected: { vectors: false, graph: false, structured: false },
        },
        governance: {
          enabled: !!this.governance,
          stats: this.governance?.getStatus() || {
            agent: null,
            governance: { totalRules: 0, enabledRules: 0, pendingApprovals: 0, recentDenials: 0, auditEntries: 0 },
            pendingApprovals: [],
            activeTasks: [],
          },
        },
      },
      health: 'healthy',
      pendingActions: this.taskQueue.length + this.runningTasks.size,
      lastActivity: this.lastActivity,
    };

    // Determine health
    const subsystemsEnabled = [
      status.subsystems.economy.enabled,
      status.subsystems.deployment.enabled,
      status.subsystems.memory.enabled,
      status.subsystems.governance.enabled,
    ].filter(Boolean).length;

    if (subsystemsEnabled === 0) {
      status.health = 'critical';
    } else if (subsystemsEnabled < 3) {
      status.health = 'degraded';
    }

    return status;
  }

  // ==========================================================================
  // Economic Operations
  // ==========================================================================

  /**
   * Get unified balance across all payment methods
   */
  async getBalance(): Promise<TreasuryBalance | null> {
    if (!this.economy) return null;
    return this.economy.getUnifiedBalance();
  }

  /**
   * Make a payment (governed)
   */
  async pay(request: {
    amount: number;
    currency: string;
    recipient: string;
    description: string;
    method?: 'stripe' | 'crypto' | 'auto';
  }): Promise<{ success: boolean; transactionId?: string; error?: string }> {
    if (!this.economy || !this.governance) {
      return { success: false, error: 'Economy or governance not initialized' };
    }

    // v16.1.2: Validate payment amount
    if (typeof request.amount !== 'number' || !Number.isFinite(request.amount)) {
      return { success: false, error: 'Invalid payment amount: must be a finite number' };
    }
    if (request.amount <= 0) {
      return { success: false, error: 'Invalid payment amount: must be positive' };
    }
    if (!request.recipient || request.recipient.trim() === '') {
      return { success: false, error: 'Invalid recipient: cannot be empty' };
    }

    // Check governance
    const permission = await this.governance.governance.checkPermission({
      actor: 'autonomous-system',
      action: 'payment',
      resource: request.recipient,
      amount: request.amount,
      metadata: { description: request.description },
    });

    if (!permission.allowed) {
      if (permission.requiresApproval) {
        return { success: false, error: `Approval required: ${permission.approvalRequest?.id}` };
      }
      return { success: false, error: `Payment denied: ${permission.deniedBy}` };
    }

    // Execute payment
    const result = await this.economy.pay(request);
    this.lastActivity = new Date().toISOString();
    return result;
  }

  /**
   * Create a revenue stream (API, subscription, etc.)
   */
  async createRevenueStream(config: {
    name: string;
    type: 'subscription' | 'one-time';
    priceUSD: number;
    description?: string;
  }): Promise<{ success: boolean; url?: string; productId?: string }> {
    try {
      if (!this.economy) {
        return { success: false };
      }

      const result = await this.economy.createRevenueStream(config.name, config.priceUSD, config.type);
      this.lastActivity = new Date().toISOString();
      return { success: !!result, url: result?.url };
    } catch (err) {
      console.error('[autonomous] createRevenueStream failed:', err);
      return { success: false };
    }
  }

  // ==========================================================================
  // Deployment Operations
  // ==========================================================================

  /**
   * Deploy a website or application (governed)
   */
  async deploy(config: WebsiteConfig): Promise<DeploymentResult> {
    try {
      if (!this.deployment || !this.governance) {
        return { success: false, error: 'Deployment or governance not initialized' };
      }

      // Check governance for deployment
      const permission = await this.governance.governance.checkPermission({
        actor: 'autonomous-system',
        action: 'deploy',
        resource: config.name,
        metadata: { template: config.template, features: config.features },
      });

      if (!permission.allowed) {
        if (permission.requiresApproval) {
          return { success: false, error: `Approval required: ${permission.approvalRequest?.id}` };
        }
        return { success: false, error: `Deployment denied: ${permission.deniedBy}` };
      }

      // Execute deployment
      const result = await this.deployment.deployFullStack(config);
      this.lastActivity = new Date().toISOString();

      // Store in memory
      if (result.success && this.memory) {
        await this.memory.store({
          content: `Deployed ${config.template} website: ${config.name} at ${result.url}`,
          type: 'episodic',
          source: 'deployment-system',
          importance: 0.8,
          tags: ['deployment', config.template, config.name],
        });
      }

      return result;
    } catch (err) {
      console.error('[autonomous] deploy failed:', err);
      return { success: false, error: `Deployment failed: ${err}` };
    }
  }

  /**
   * Deploy a paid API service
   */
  async deployPaidAPI(config: {
    name: string;
    description: string;
    handler: string;
    pricePerRequest: number;
  }): Promise<DeploymentResult & { stripeProductId?: string }> {
    try {
      if (!this.deployment || !this.economy) {
        return { success: false, error: 'Deployment or economy not initialized' };
      }

      // Deploy the API
      const deployResult = await this.deployment.deployPaidAPI({
        name: config.name,
        description: config.description,
        handler: config.handler,
        pricing: { perRequest: config.pricePerRequest },
      });

      if (!deployResult.success) {
        return deployResult;
      }

      // Create Stripe product for billing (usage-based via subscription)
      const revenueStream = await this.economy.createRevenueStream(
        config.name,
        config.pricePerRequest,
        'subscription'
      );

      this.lastActivity = new Date().toISOString();
      return { ...deployResult, stripeProductId: revenueStream?.url };
    } catch (err) {
      console.error('[autonomous] deployPaidAPI failed:', err);
      return { success: false, error: `Deploy failed: ${err}` };
    }
  }

  // ==========================================================================
  // Memory Operations
  // ==========================================================================

  /**
   * Store a memory
   */
  async remember(entry: {
    content: string;
    type: MemoryEntry['type'];
    importance?: number;
    tags?: string[];
  }): Promise<{ id: string; success: boolean }> {
    if (!this.memory) {
      return { id: '', success: false };
    }

    const result = await this.memory.store({
      content: entry.content,
      type: entry.type,
      source: 'autonomous-system',
      importance: entry.importance,
      tags: entry.tags,
    });

    this.lastActivity = new Date().toISOString();
    return result;
  }

  /**
   * Recall memories
   */
  async recall(query: string, options?: {
    types?: MemoryEntry['type'][];
    limit?: number;
    minImportance?: number;
  }): Promise<SearchResult[]> {
    if (!this.memory) return [];
    return this.memory.recall(query, options);
  }

  /**
   * Learn a new skill
   */
  async learnSkill(skill: {
    name: string;
    description: string;
    code?: string;
  }): Promise<{ success: boolean; skillId?: string }> {
    if (!this.memory) return { success: false };
    return this.memory.learnSkill(skill);
  }

  // ==========================================================================
  // Governance Operations
  // ==========================================================================

  /**
   * Get pending approvals for human review
   */
  getPendingApprovals(): ApprovalRequest[] {
    if (!this.governance) return [];
    return this.governance.hitl.getPendingReviews();
  }

  /**
   * Submit human decision on approval
   */
  submitApproval(approvalId: string, decision: 'approved' | 'rejected', reviewer: string, notes?: string): ApprovalRequest | null {
    if (!this.governance) return null;
    return this.governance.hitl.submitDecision(approvalId, decision, reviewer, notes);
  }

  /**
   * Emergency stop - halt all operations
   */
  emergencyStop(reason: string): { stoppedApprovals: number; stoppedTasks: number } {
    const stoppedApprovals = this.governance?.hitl.emergencyStop(reason) || 0;

    // Stop all running tasks
    const stoppedTasks = this.runningTasks.size;
    for (const task of this.runningTasks.values()) {
      task.status = 'blocked';
      task.error = `Emergency stop: ${reason}`;
    }
    this.runningTasks.clear();
    this.taskQueue = [];

    console.warn('[AutonomousSystem] EMERGENCY STOP:', reason);
    return { stoppedApprovals, stoppedTasks };
  }

  /**
   * Get agent card for A2A protocol
   */
  getAgentCard(): AgentCard | null {
    if (!this.governance) return null;
    return this.governance.a2a.getSelfCard();
  }

  // ==========================================================================
  // Task Queue
  // ==========================================================================

  /**
   * Queue an autonomous task
   */
  queueTask(task: Omit<AutonomousTask, 'id' | 'status' | 'created'>): string {
    const id = `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const fullTask: AutonomousTask = {
      ...task,
      id,
      status: 'queued',
      created: new Date().toISOString(),
    };

    this.taskQueue.push(fullTask);
    if (this.taskQueue.length > 200) {
      this.taskQueue = this.taskQueue.slice(-100);
    }
    return id;
  }

  /**
   * Process the next task in queue
   */
  async processNextTask(): Promise<AutonomousTask | null> {
    if (this.taskQueue.length === 0) return null;

    // Sort by priority and take first
    this.taskQueue.sort((a, b) => {
      const priorityOrder = { critical: 0, high: 1, normal: 2, low: 3 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });

    const task = this.taskQueue.shift()!;
    task.status = 'running';
    task.started = new Date().toISOString();
    this.runningTasks.set(task.id, task);
    if (this.runningTasks.size > 500) {
      const keys = Array.from(this.runningTasks.keys());
      for (let i = 0; i < 100; i++) this.runningTasks.delete(keys[i]);
    }

    try {
      // Execute based on task type
      switch (task.type) {
        case 'earn':
          task.result = await this.handleEarnTask(task);
          break;
        case 'deploy':
          task.result = await this.handleDeployTask(task);
          break;
        case 'remember':
          task.result = await this.handleRememberTask(task);
          break;
        case 'collaborate':
          task.result = await this.handleCollaborateTask(task);
          break;
        default:
          task.result = { message: 'Custom task completed' };
      }

      task.status = 'completed';
    } catch (error) {
      task.status = 'failed';
      task.error = String(error);
    }

    task.completed = new Date().toISOString();
    this.runningTasks.delete(task.id);
    this.lastActivity = new Date().toISOString();

    return task;
  }

  private async handleEarnTask(task: AutonomousTask): Promise<unknown> {
    // Real revenue generation via Stripe and CompIntel
    try {
      const { getRevenueLoop } = await import('../services/revenue-loop.js');
      const revenueLoop = getRevenueLoop();

      // Parse task description for action type
      const description = task.description.toLowerCase();

      if (description.includes('setup') || description.includes('initialize')) {
        // Setup Stripe products and payment links
        const result = await revenueLoop.setup();
        return {
          type: 'earn',
          action: 'setup',
          product: result.product.id,
          paymentLinks: Object.fromEntries(
            Object.entries(result.paymentLinks).map(([k, v]) => [k, v.url])
          ),
          status: 'success'
        };
      }

      if (description.includes('scan') || description.includes('intel')) {
        // Run CompIntel scan for a paying customer
        const customerId = (task as any).customerId || process.env.STRIPE_CUSTOMER_ID;
        const competitors = (task as any).competitors || [
          { name: 'Competitor', domain: 'example.com', pages: ['https://example.com'] }
        ];

        const result = await revenueLoop.runPaidScan(customerId, competitors);
        return {
          type: 'earn',
          action: 'scan',
          success: result.success,
          changes: result.changes?.length || 0,
          subscription: result.subscription,
          error: result.error
        };
      }

      // Default: return current stats
      const stats = revenueLoop.getStats();
      return {
        type: 'earn',
        action: 'status',
        revenue: stats.totalRevenue,
        scans: stats.scansDelivered,
        subscriptions: stats.activeSubscriptions,
        status: 'success'
      };
    } catch (err) {
      return {
        type: 'earn',
        status: 'error',
        error: err instanceof Error ? err.message : String(err)
      };
    }
  }

  private async handleDeployTask(task: AutonomousTask): Promise<unknown> {
    // Real deployment via Vercel/Supabase/Cloudflare
    if (!this.deployment) {
      return { type: 'deploy', status: 'error', error: 'Deployment system not initialized' };
    }

    try {
      const config = (task as any).config || {
        name: `genesis-deploy-${Date.now()}`,
        template: 'landing',
        features: { auth: false, payments: false }
      };

      // Check governance approval for high-impact deploys
      if (this.governance && config.features?.payments) {
        const permission = await this.governance.governance.checkPermission({
          actor: 'autonomous-system',
          action: 'deploy-with-payments',
          resource: config.name,
          metadata: { template: config.template }
        });

        if (!permission.allowed) {
          return {
            type: 'deploy',
            status: 'blocked',
            reason: permission.deniedBy || 'governance-denied',
            approvalRequired: permission.requiresApproval
          };
        }
      }

      const result = await this.deployment.deployFullStack(config);

      // Store deployment in memory
      if (result.success && this.memory) {
        await this.memory.store({
          content: `Deployed ${config.template}: ${config.name} at ${result.url}`,
          type: 'episodic',
          source: 'autonomous-deployment',
          importance: 0.85,
          tags: ['deployment', 'autonomous', config.template]
        });
      }

      return {
        type: 'deploy',
        status: result.success ? 'success' : 'error',
        url: result.url,
        error: result.error
      };
    } catch (err) {
      return {
        type: 'deploy',
        status: 'error',
        error: err instanceof Error ? err.message : String(err)
      };
    }
  }

  private async handleRememberTask(task: AutonomousTask): Promise<unknown> {
    // Real memory storage with importance and consolidation
    if (!this.memory) {
      return { type: 'remember', status: 'error', error: 'Memory system not initialized' };
    }

    try {
      const content = (task as any).content || task.description;
      const memoryType = (task as any).memoryType || 'episodic';
      const importance = (task as any).importance || 0.7;
      const tags = (task as any).tags || ['autonomous', 'learned'];

      const result = await this.memory.store({
        content,
        type: memoryType,
        source: 'autonomous-system',
        importance,
        tags
      });

      return {
        type: 'remember',
        status: 'success',
        memoryId: result.id,
        stored: result.success
      };
    } catch (err) {
      return {
        type: 'remember',
        status: 'error',
        error: err instanceof Error ? err.message : String(err)
      };
    }
  }

  private async handleCollaborateTask(task: AutonomousTask): Promise<unknown> {
    // Real A2A collaboration via agent card protocol
    if (!this.governance) {
      return { type: 'collaborate', status: 'error', error: 'Governance system not initialized' };
    }

    try {
      const targetCapability = (task as any).capability;
      const minRating = (task as any).minRating;

      // Get our agent card
      const selfCard = this.governance.a2a.getSelfCard();
      if (!selfCard) {
        return {
          type: 'collaborate',
          status: 'error',
          error: 'No agent card configured'
        };
      }

      // Discover agents with specific capability
      if (targetCapability) {
        const agents = await this.governance.a2a.discoverAgents({
          capability: targetCapability,
          minRating: minRating
        });

        if (agents.length === 0) {
          return {
            type: 'collaborate',
            status: 'not_found',
            message: `No agents found with capability: ${targetCapability}`
          };
        }

        return {
          type: 'collaborate',
          status: 'success',
          discovered: agents.map(a => ({
            id: a.id,
            name: a.name,
            capabilities: a.capabilities.map(c => c.name),
            pricing: a.pricing
          }))
        };
      }

      // No target: just return our capabilities
      return {
        type: 'collaborate',
        status: 'success',
        selfCard: {
          id: selfCard.id,
          name: selfCard.name,
          capabilities: selfCard.capabilities.map(c => c.name)
        }
      };
    } catch (err) {
      return {
        type: 'collaborate',
        status: 'error',
        error: err instanceof Error ? err.message : String(err)
      };
    }
  }

  /**
   * Run the autonomous loop
   */
  async runLoop(intervalMs: number = 5000, maxIterations?: number): Promise<void> {
    try {
      console.log('[AutonomousSystem] Starting autonomous loop...');

      let iterations = 0;
      while (!maxIterations || iterations < maxIterations) {
        const task = await this.processNextTask();
        if (task) {
          console.log(`[AutonomousSystem] Completed task: ${task.id} (${task.type})`);
        }

        await new Promise(resolve => setTimeout(resolve, intervalMs));
        iterations++;
      }

      console.log('[AutonomousSystem] Autonomous loop ended');
    } catch (err) {
      console.error('[autonomous] runLoop failed:', err);
    }
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

let autonomousSystemInstance: AutonomousSystem | null = null;

export function getAutonomousSystem(config?: AutonomousConfig): AutonomousSystem {
  if (!autonomousSystemInstance) {
    autonomousSystemInstance = new AutonomousSystem(config);
  }
  return autonomousSystemInstance;
}

// v25.0: Decision Engine — unified autonomous decision making
export {
  DecisionEngine,
  getDecisionEngine,
  resetDecisionEngine,
  type DecisionDomain,
  type DecisionContext,
  type DecisionOption,
  type DecisionConstraint,
  type ResourceRequirement,
  type Decision,
  type DecisionFactors,
  type DecisionOutcome,
  type DecisionEngineConfig,
  type EngineState,
} from './decision-engine.js';

// v28.0: Strategy Orchestrator — meta-level resource allocation
export {
  StrategyOrchestrator,
  getStrategyOrchestrator,
  resetStrategyOrchestrator,
  type Strategy,
  type StrategyAllocation,
  type MarketConditions,
  type StrategyDecision,
  type StrategyOutcome,
  type StrategyConfig,
} from './strategy-orchestrator.js';

// v29.0: Self-Reflection Engine — metacognitive introspection
export {
  SelfReflectionEngine,
  getSelfReflectionEngine,
  resetSelfReflectionEngine,
  type ReflectionConfig,
  type CognitiveBias,
  type BiasDetection,
  type FailurePattern,
  type CognitiveMetrics,
  type ReflectionInsight,
  type ImprovementProposal,
  type ReflectionReport,
} from './self-reflection.js';

// v30.0: Goal System — autonomous goal pursuit
export {
  GoalSystem,
  getGoalSystem,
  resetGoalSystem,
  type GoalConfig,
  type GoalDomain,
  type GoalStatus,
  type GoalPriority,
  type GoalMetrics,
  type Milestone,
  type Goal,
  type GoalProposal,
  type GoalEvaluation,
} from './goal-system.js';

// v31.0: Attention Controller — cognitive focus management
export {
  AttentionController,
  getAttentionController,
  resetAttentionController,
  type AttentionConfig,
  type AttentionSource,
  type AttentionPriority,
  type AttentionItem,
  type AttentionFocus,
  type AttentionSwitch,
  type AttentionStats,
} from './attention-controller.js';

// v32.0: Skill Acquisition System — capability learning
export {
  SkillAcquisitionSystem,
  getSkillAcquisitionSystem,
  resetSkillAcquisitionSystem,
  type SkillConfig,
  type SkillCategory,
  type SkillStage,
  type SkillMetrics,
  type Skill,
  type SkillPattern,
  type SkillGap,
  type SkillDevelopmentPlan,
} from './skill-acquisition.js';

export default AutonomousSystem;
