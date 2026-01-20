/**
 * Genesis A2A Protocol & Governance Layer - FASE 4
 *
 * Agent-to-Agent communication and autonomous governance:
 * - A2A Protocol: Google/Linux Foundation standard for agent communication
 * - Agent Registry: Discovery and capability advertisement
 * - Task Marketplace: Buy/sell computational services
 * - Governance: Budget controls, approval workflows, audit trails
 * - HITL (Human-in-the-Loop): Critical decision escalation
 *
 * Enables Genesis to operate autonomously while maintaining safety
 */

// ============================================================================
// Types
// ============================================================================

export interface AgentCard {
  id: string;
  name: string;
  description: string;
  version: string;
  capabilities: AgentCapability[];
  endpoints: {
    a2a: string;      // A2A protocol endpoint
    health: string;   // Health check
    metrics?: string; // Optional metrics endpoint
  };
  pricing?: {
    currency: 'USD' | 'USDC' | 'ETH';
    perRequest?: number;
    perMinute?: number;
    subscription?: { monthly: number; annual: number };
  };
  authentication: {
    type: 'api-key' | 'oauth2' | 'x402' | 'none';
    config?: Record<string, unknown>;
  };
  metadata: {
    owner: string;
    created: string;
    updated: string;
    verified: boolean;
    rating?: number;
    usageCount?: number;
  };
}

export interface AgentCapability {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  examples?: { input: unknown; output: unknown }[];
  constraints?: {
    maxDuration?: number;   // Max execution time in ms
    maxCost?: number;       // Max cost per invocation
    rateLimit?: number;     // Requests per minute
  };
}

export interface A2AMessage {
  id: string;
  from: string;       // Agent ID
  to: string;         // Agent ID
  type: 'request' | 'response' | 'event' | 'error';
  capability: string;
  payload: unknown;
  metadata: {
    timestamp: string;
    correlationId?: string;
    replyTo?: string;
    ttl?: number;
    priority?: 'low' | 'normal' | 'high' | 'critical';
  };
  signature?: string;  // Cryptographic signature
}

export interface TaskRequest {
  id: string;
  requester: string;
  capability: string;
  input: unknown;
  constraints: {
    maxCost: number;
    maxDuration: number;
    requiredRating?: number;
  };
  created: string;
  status: 'pending' | 'assigned' | 'executing' | 'completed' | 'failed' | 'cancelled';
  assignedAgent?: string;
  result?: unknown;
  cost?: number;
}

export interface GovernanceRule {
  id: string;
  name: string;
  description: string;
  type: 'budget' | 'approval' | 'rate-limit' | 'allowlist' | 'denylist' | 'custom';
  condition: string;   // Expression or function
  action: 'allow' | 'deny' | 'require-approval' | 'alert' | 'custom';
  priority: number;
  enabled: boolean;
  metadata?: Record<string, unknown>;
}

export interface ApprovalRequest {
  id: string;
  type: 'payment' | 'deployment' | 'data-access' | 'external-call' | 'custom';
  description: string;
  requestedBy: string;
  amount?: number;
  resource?: string;
  urgency: 'low' | 'normal' | 'high' | 'critical';
  context: Record<string, unknown>;
  status: 'pending' | 'approved' | 'rejected' | 'expired';
  created: string;
  reviewedBy?: string;
  reviewedAt?: string;
  notes?: string;
}

export interface AuditEntry {
  id: string;
  timestamp: string;
  actor: string;
  action: string;
  resource: string;
  outcome: 'success' | 'failure' | 'denied';
  details: Record<string, unknown>;
  governanceRules?: string[];
  approvalId?: string;
}

// ============================================================================
// A2A Protocol Implementation
// ============================================================================

export class A2AProtocol {
  private selfCard: AgentCard | null = null;
  private registry: Map<string, AgentCard> = new Map();
  private messageHandlers: Map<string, (msg: A2AMessage) => Promise<unknown>> = new Map();
  private pendingRequests: Map<string, { resolve: Function; reject: Function; timeout: NodeJS.Timeout }> = new Map();

  /**
   * Register this agent's card
   */
  registerSelf(card: Omit<AgentCard, 'metadata'>): void {
    this.selfCard = {
      ...card,
      metadata: {
        owner: 'genesis',
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        verified: false,
        usageCount: 0,
      },
    };
    this.registry.set(card.id, this.selfCard);
  }

  /**
   * Get this agent's card
   */
  getSelfCard(): AgentCard | null {
    return this.selfCard;
  }

  /**
   * Discover agents with specific capabilities
   */
  async discoverAgents(options?: {
    capability?: string;
    minRating?: number;
    maxPrice?: number;
  }): Promise<AgentCard[]> {
    // In production, this would query a distributed registry
    // For now, return known agents
    let agents = Array.from(this.registry.values());

    if (options?.capability) {
      agents = agents.filter(a =>
        a.capabilities.some(c => c.name.toLowerCase().includes(options.capability!.toLowerCase()))
      );
    }

    if (options?.minRating) {
      agents = agents.filter(a => (a.metadata.rating || 0) >= options.minRating!);
    }

    if (options?.maxPrice) {
      agents = agents.filter(a => (a.pricing?.perRequest || 0) <= options.maxPrice!);
    }

    return agents;
  }

  /**
   * Register an agent from discovery
   */
  registerAgent(card: AgentCard): void {
    this.registry.set(card.id, card);
    console.log(`[A2A] Registered agent: ${card.name} (${card.id})`);
  }

  /**
   * Register a capability handler
   */
  onCapability(capability: string, handler: (msg: A2AMessage) => Promise<unknown>): void {
    this.messageHandlers.set(capability, handler);
  }

  /**
   * Send a request to another agent
   */
  async request(
    toAgentId: string,
    capability: string,
    payload: unknown,
    options?: { timeout?: number; priority?: A2AMessage['metadata']['priority'] }
  ): Promise<unknown> {
    const agent = this.registry.get(toAgentId);
    if (!agent) {
      throw new Error(`Agent not found: ${toAgentId}`);
    }

    const message: A2AMessage = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      from: this.selfCard?.id || 'genesis',
      to: toAgentId,
      type: 'request',
      capability,
      payload,
      metadata: {
        timestamp: new Date().toISOString(),
        priority: options?.priority || 'normal',
        ttl: options?.timeout || 30000,
      },
    };

    // Create promise for response
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(message.id);
        reject(new Error(`Request timeout: ${message.id}`));
      }, options?.timeout || 30000);

      this.pendingRequests.set(message.id, { resolve, reject, timeout });

      // Send message (in production, this would use HTTP/WebSocket to agent.endpoints.a2a)
      this.sendMessage(agent, message).catch(err => {
        clearTimeout(timeout);
        this.pendingRequests.delete(message.id);
        reject(err);
      });
    });
  }

  /**
   * Handle incoming message
   */
  async handleMessage(message: A2AMessage): Promise<A2AMessage | null> {
    if (message.type === 'response' || message.type === 'error') {
      // Handle response to our request
      const pending = this.pendingRequests.get(message.metadata.replyTo || '');
      if (pending) {
        clearTimeout(pending.timeout);
        this.pendingRequests.delete(message.metadata.replyTo || '');

        if (message.type === 'error') {
          pending.reject(new Error(String(message.payload)));
        } else {
          pending.resolve(message.payload);
        }
      }
      return null;
    }

    if (message.type === 'request') {
      // Handle incoming request
      const handler = this.messageHandlers.get(message.capability);
      if (!handler) {
        return {
          id: `msg_${Date.now()}`,
          from: this.selfCard?.id || 'genesis',
          to: message.from,
          type: 'error',
          capability: message.capability,
          payload: `Unknown capability: ${message.capability}`,
          metadata: {
            timestamp: new Date().toISOString(),
            replyTo: message.id,
          },
        };
      }

      try {
        const result = await handler(message);
        return {
          id: `msg_${Date.now()}`,
          from: this.selfCard?.id || 'genesis',
          to: message.from,
          type: 'response',
          capability: message.capability,
          payload: result,
          metadata: {
            timestamp: new Date().toISOString(),
            replyTo: message.id,
          },
        };
      } catch (error) {
        return {
          id: `msg_${Date.now()}`,
          from: this.selfCard?.id || 'genesis',
          to: message.from,
          type: 'error',
          capability: message.capability,
          payload: String(error),
          metadata: {
            timestamp: new Date().toISOString(),
            replyTo: message.id,
          },
        };
      }
    }

    return null;
  }

  /**
   * Send message to agent (stub - would use HTTP in production)
   */
  private async sendMessage(agent: AgentCard, message: A2AMessage): Promise<void> {
    console.log(`[A2A] Sending message to ${agent.name}:`, message.capability);

    // In production, this would be:
    // await fetch(agent.endpoints.a2a, {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify(message),
    // });

    // For now, simulate local handling if agent is in registry
    const response = await this.handleMessage(message);
    if (response) {
      await this.handleMessage(response);
    }
  }
}

// ============================================================================
// Task Marketplace
// ============================================================================

export class TaskMarketplace {
  private tasks: Map<string, TaskRequest> = new Map();
  private a2a: A2AProtocol;

  constructor(a2a: A2AProtocol) {
    this.a2a = a2a;
  }

  /**
   * Post a task request to the marketplace
   */
  async postTask(request: Omit<TaskRequest, 'id' | 'created' | 'status'>): Promise<TaskRequest> {
    const task: TaskRequest = {
      ...request,
      id: `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      created: new Date().toISOString(),
      status: 'pending',
    };

    this.tasks.set(task.id, task);

    // Find suitable agents
    const agents = await this.a2a.discoverAgents({
      capability: task.capability,
      maxPrice: task.constraints.maxCost,
      minRating: task.constraints.requiredRating,
    });

    if (agents.length > 0) {
      // Auto-assign to best agent (highest rating, lowest price)
      const bestAgent = agents.sort((a, b) => {
        const ratingDiff = (b.metadata.rating || 0) - (a.metadata.rating || 0);
        if (ratingDiff !== 0) return ratingDiff;
        return (a.pricing?.perRequest || 0) - (b.pricing?.perRequest || 0);
      })[0];

      task.assignedAgent = bestAgent.id;
      task.status = 'assigned';
    }

    return task;
  }

  /**
   * Execute an assigned task
   */
  async executeTask(taskId: string): Promise<TaskRequest> {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    if (!task.assignedAgent) {
      throw new Error(`Task not assigned: ${taskId}`);
    }

    task.status = 'executing';

    try {
      const result = await this.a2a.request(
        task.assignedAgent,
        task.capability,
        task.input,
        { timeout: task.constraints.maxDuration }
      );

      task.result = result;
      task.status = 'completed';
    } catch (error) {
      task.result = { error: String(error) };
      task.status = 'failed';
    }

    return task;
  }

  /**
   * Get task by ID
   */
  getTask(taskId: string): TaskRequest | undefined {
    return this.tasks.get(taskId);
  }

  /**
   * List tasks with optional filters
   */
  listTasks(filters?: {
    status?: TaskRequest['status'];
    requester?: string;
    capability?: string;
  }): TaskRequest[] {
    let tasks = Array.from(this.tasks.values());

    if (filters?.status) {
      tasks = tasks.filter(t => t.status === filters.status);
    }
    if (filters?.requester) {
      tasks = tasks.filter(t => t.requester === filters.requester);
    }
    if (filters?.capability) {
      tasks = tasks.filter(t => t.capability.includes(filters.capability!));
    }

    return tasks;
  }
}

// ============================================================================
// Governance Engine
// ============================================================================

export class GovernanceEngine {
  private rules: Map<string, GovernanceRule> = new Map();
  private auditLog: AuditEntry[] = [];
  private pendingApprovals: Map<string, ApprovalRequest> = new Map();
  private approvalHandlers: ((request: ApprovalRequest) => Promise<boolean>)[] = [];

  constructor() {
    this.initializeDefaultRules();
  }

  private initializeDefaultRules(): void {
    // Default safety rules
    const defaultRules: GovernanceRule[] = [
      {
        id: 'budget-daily-limit',
        name: 'Daily Budget Limit',
        description: 'Limit daily spending to $100 without approval',
        type: 'budget',
        condition: 'dailySpending > 100',
        action: 'require-approval',
        priority: 100,
        enabled: true,
      },
      {
        id: 'large-payment',
        name: 'Large Payment Approval',
        description: 'Require approval for payments over $50',
        type: 'approval',
        condition: 'paymentAmount > 50',
        action: 'require-approval',
        priority: 90,
        enabled: true,
      },
      {
        id: 'external-api-limit',
        name: 'External API Rate Limit',
        description: 'Limit external API calls to 1000/hour',
        type: 'rate-limit',
        condition: 'externalApiCalls > 1000',
        action: 'deny',
        priority: 80,
        enabled: true,
      },
      {
        id: 'deployment-approval',
        name: 'Deployment Approval',
        description: 'Require approval for all deployments',
        type: 'approval',
        condition: 'action === "deploy"',
        action: 'require-approval',
        priority: 95,
        enabled: true,
      },
    ];

    for (const rule of defaultRules) {
      this.rules.set(rule.id, rule);
    }
  }

  /**
   * Add or update a governance rule
   */
  setRule(rule: GovernanceRule): void {
    this.rules.set(rule.id, rule);
    this.audit('system', 'rule-update', rule.id, 'success', { rule });
  }

  /**
   * Remove a governance rule
   */
  removeRule(ruleId: string): boolean {
    const deleted = this.rules.delete(ruleId);
    if (deleted) {
      this.audit('system', 'rule-delete', ruleId, 'success', {});
    }
    return deleted;
  }

  /**
   * Check if an action is allowed by governance rules
   */
  async checkPermission(context: {
    actor: string;
    action: string;
    resource: string;
    amount?: number;
    metadata?: Record<string, unknown>;
  }): Promise<{
    allowed: boolean;
    requiresApproval: boolean;
    deniedBy?: string;
    approvalRequest?: ApprovalRequest;
  }> {
    const applicableRules = Array.from(this.rules.values())
      .filter(r => r.enabled)
      .sort((a, b) => b.priority - a.priority);

    for (const rule of applicableRules) {
      const matches = this.evaluateCondition(rule.condition, {
        ...context,
        dailySpending: 0, // Would be calculated from audit log
        paymentAmount: context.amount || 0,
        externalApiCalls: 0, // Would be calculated from metrics
      });

      if (matches) {
        switch (rule.action) {
          case 'deny':
            this.audit(context.actor, context.action, context.resource, 'denied', { rule: rule.id });
            return { allowed: false, requiresApproval: false, deniedBy: rule.id };

          case 'require-approval':
            const approvalRequest = await this.createApprovalRequest({
              type: this.mapActionToApprovalType(context.action),
              description: `${context.action} on ${context.resource}`,
              requestedBy: context.actor,
              amount: context.amount,
              resource: context.resource,
              urgency: 'normal',
              context: context.metadata || {},
            });
            return { allowed: false, requiresApproval: true, approvalRequest };

          case 'alert':
            console.warn(`[Governance] Alert triggered by rule ${rule.id}:`, context);
            break;

          case 'allow':
            // Continue to next rule
            break;
        }
      }
    }

    // Default: allow
    this.audit(context.actor, context.action, context.resource, 'success', {});
    return { allowed: true, requiresApproval: false };
  }

  /**
   * Safe condition evaluator - v9.2.0 Security fix
   * Replaced unsafe new Function() with allowlist-based evaluation
   * Supports: variable comparisons (>, <, >=, <=, ==, !=), boolean checks
   */
  private evaluateCondition(condition: string, context: Record<string, unknown>): boolean {
    try {
      // Parse simple conditions like "importance > 0.5" or "risk == 'high'"
      // Pattern: variable operator value
      const comparisonMatch = condition.match(/^\s*(\w+)\s*(>=|<=|===|!==|==|!=|>|<)\s*(.+)\s*$/);

      if (comparisonMatch) {
        const [, varName, operator, rawValue] = comparisonMatch;
        const contextValue = context[varName];

        // Parse the comparison value
        let compareValue: unknown;
        const trimmedValue = rawValue.trim();

        if (trimmedValue === 'true') compareValue = true;
        else if (trimmedValue === 'false') compareValue = false;
        else if (trimmedValue === 'null') compareValue = null;
        else if (/^-?\d+(\.\d+)?$/.test(trimmedValue)) compareValue = parseFloat(trimmedValue);
        else if (/^["'](.*)["']$/.test(trimmedValue)) compareValue = trimmedValue.slice(1, -1);
        else compareValue = trimmedValue;

        // Perform comparison
        switch (operator) {
          case '>': return Number(contextValue) > Number(compareValue);
          case '<': return Number(contextValue) < Number(compareValue);
          case '>=': return Number(contextValue) >= Number(compareValue);
          case '<=': return Number(contextValue) <= Number(compareValue);
          case '==': return contextValue == compareValue;
          case '===': return contextValue === compareValue;
          case '!=': return contextValue != compareValue;
          case '!==': return contextValue !== compareValue;
        }
      }

      // Handle simple boolean variable check
      const boolMatch = condition.match(/^\s*(\w+)\s*$/);
      if (boolMatch) {
        return Boolean(context[boolMatch[1]]);
      }

      // Handle negated boolean: !variable
      const negatedMatch = condition.match(/^\s*!\s*(\w+)\s*$/);
      if (negatedMatch) {
        return !context[negatedMatch[1]];
      }

      // Unsupported condition format - fail closed
      console.warn(`[Governance] Unsupported condition format: ${condition}`);
      return false;
    } catch {
      return false;
    }
  }

  private mapActionToApprovalType(action: string): ApprovalRequest['type'] {
    if (action.includes('pay') || action.includes('transfer')) return 'payment';
    if (action.includes('deploy')) return 'deployment';
    if (action.includes('read') || action.includes('access')) return 'data-access';
    if (action.includes('call') || action.includes('request')) return 'external-call';
    return 'custom';
  }

  /**
   * Create an approval request
   */
  async createApprovalRequest(request: Omit<ApprovalRequest, 'id' | 'status' | 'created'>): Promise<ApprovalRequest> {
    const approval: ApprovalRequest = {
      ...request,
      id: `approval_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      status: 'pending',
      created: new Date().toISOString(),
    };

    this.pendingApprovals.set(approval.id, approval);

    // Notify approval handlers (HITL interface)
    for (const handler of this.approvalHandlers) {
      try {
        const autoApproved = await handler(approval);
        if (autoApproved) {
          approval.status = 'approved';
          approval.reviewedAt = new Date().toISOString();
          approval.reviewedBy = 'auto-approval';
          break;
        }
      } catch (error) {
        console.error('[Governance] Approval handler error:', error);
      }
    }

    return approval;
  }

  /**
   * Register an approval handler (for HITL integration)
   */
  onApprovalRequest(handler: (request: ApprovalRequest) => Promise<boolean>): void {
    this.approvalHandlers.push(handler);
  }

  /**
   * Review an approval request
   */
  reviewApproval(approvalId: string, decision: 'approved' | 'rejected', reviewer: string, notes?: string): ApprovalRequest | null {
    const approval = this.pendingApprovals.get(approvalId);
    if (!approval || approval.status !== 'pending') {
      return null;
    }

    approval.status = decision;
    approval.reviewedBy = reviewer;
    approval.reviewedAt = new Date().toISOString();
    approval.notes = notes;

    this.audit(reviewer, `approval-${decision}`, approvalId, 'success', { approval });

    return approval;
  }

  /**
   * Get pending approvals
   */
  getPendingApprovals(): ApprovalRequest[] {
    return Array.from(this.pendingApprovals.values())
      .filter(a => a.status === 'pending');
  }

  /**
   * Add an audit entry
   */
  private audit(actor: string, action: string, resource: string, outcome: AuditEntry['outcome'], details: Record<string, unknown>): void {
    const entry: AuditEntry = {
      id: `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
      actor,
      action,
      resource,
      outcome,
      details,
    };

    this.auditLog.push(entry);

    // Keep only last 10000 entries in memory
    if (this.auditLog.length > 10000) {
      this.auditLog = this.auditLog.slice(-10000);
    }
  }

  /**
   * Get audit log with filters
   */
  getAuditLog(filters?: {
    actor?: string;
    action?: string;
    resource?: string;
    outcome?: AuditEntry['outcome'];
    since?: string;
    limit?: number;
  }): AuditEntry[] {
    let entries = [...this.auditLog];

    if (filters?.actor) {
      entries = entries.filter(e => e.actor === filters.actor);
    }
    if (filters?.action) {
      entries = entries.filter(e => e.action.includes(filters.action!));
    }
    if (filters?.resource) {
      entries = entries.filter(e => e.resource.includes(filters.resource!));
    }
    if (filters?.outcome) {
      entries = entries.filter(e => e.outcome === filters.outcome);
    }
    if (filters?.since) {
      entries = entries.filter(e => e.timestamp >= filters.since!);
    }

    return entries.slice(-(filters?.limit || 100)).reverse();
  }

  /**
   * Get governance statistics
   */
  getStats(): {
    totalRules: number;
    enabledRules: number;
    pendingApprovals: number;
    recentDenials: number;
    auditEntries: number;
  } {
    const rules = Array.from(this.rules.values());
    const recentDenials = this.auditLog
      .filter(e => e.outcome === 'denied' && new Date(e.timestamp) > new Date(Date.now() - 24 * 60 * 60 * 1000))
      .length;

    return {
      totalRules: rules.length,
      enabledRules: rules.filter(r => r.enabled).length,
      pendingApprovals: this.getPendingApprovals().length,
      recentDenials,
      auditEntries: this.auditLog.length,
    };
  }
}

// ============================================================================
// HITL (Human-in-the-Loop) Interface
// ============================================================================

export class HITLInterface {
  private governance: GovernanceEngine;
  private notificationChannel: ((message: string, data: unknown) => Promise<void>) | null = null;

  constructor(governance: GovernanceEngine) {
    this.governance = governance;
    this.setupApprovalHandler();
  }

  /**
   * Set notification channel (e.g., Slack webhook)
   */
  setNotificationChannel(channel: (message: string, data: unknown) => Promise<void>): void {
    this.notificationChannel = channel;
  }

  private setupApprovalHandler(): void {
    this.governance.onApprovalRequest(async (request) => {
      // Auto-approve low-risk requests
      if (this.isLowRisk(request)) {
        console.log('[HITL] Auto-approved low-risk request:', request.id);
        return true;
      }

      // Notify human for review
      await this.notifyForApproval(request);
      return false;
    });
  }

  private isLowRisk(request: ApprovalRequest): boolean {
    // Auto-approve criteria
    if (request.type === 'payment' && (request.amount || 0) < 5) {
      return true;
    }
    if (request.type === 'external-call' && request.urgency === 'low') {
      return true;
    }
    return false;
  }

  private async notifyForApproval(request: ApprovalRequest): Promise<void> {
    const message = `🔔 Approval Required: ${request.type}\n` +
      `ID: ${request.id}\n` +
      `Description: ${request.description}\n` +
      `Amount: ${request.amount ? `$${request.amount}` : 'N/A'}\n` +
      `Urgency: ${request.urgency}\n` +
      `Requested by: ${request.requestedBy}`;

    console.log('[HITL]', message);

    if (this.notificationChannel) {
      await this.notificationChannel(message, request);
    }
  }

  /**
   * Get all pending approvals for human review
   */
  getPendingReviews(): ApprovalRequest[] {
    return this.governance.getPendingApprovals();
  }

  /**
   * Submit human decision
   */
  submitDecision(approvalId: string, decision: 'approved' | 'rejected', reviewer: string, notes?: string): ApprovalRequest | null {
    return this.governance.reviewApproval(approvalId, decision, reviewer, notes);
  }

  /**
   * Emergency stop - deny all pending approvals
   */
  emergencyStop(reason: string): number {
    const pending = this.governance.getPendingApprovals();
    let stopped = 0;

    for (const approval of pending) {
      this.governance.reviewApproval(approval.id, 'rejected', 'emergency-stop', reason);
      stopped++;
    }

    console.warn(`[HITL] EMERGENCY STOP: Rejected ${stopped} pending approvals. Reason: ${reason}`);
    return stopped;
  }
}

// ============================================================================
// Unified Governance System
// ============================================================================

export class GovernanceSystem {
  public a2a: A2AProtocol;
  public marketplace: TaskMarketplace;
  public governance: GovernanceEngine;
  public hitl: HITLInterface;

  constructor() {
    this.a2a = new A2AProtocol();
    this.marketplace = new TaskMarketplace(this.a2a);
    this.governance = new GovernanceEngine();
    this.hitl = new HITLInterface(this.governance);
  }

  /**
   * Initialize the governance system with Genesis agent card
   */
  initialize(config?: {
    agentName?: string;
    capabilities?: AgentCapability[];
    pricing?: AgentCard['pricing'];
  }): void {
    // Register Genesis as an agent
    this.a2a.registerSelf({
      id: 'genesis-main',
      name: config?.agentName || 'Genesis Autonomous System',
      description: 'Self-aware autonomous AI system with active inference and multi-agent capabilities',
      version: '7.22.1',
      capabilities: config?.capabilities || [
        {
          name: 'code-generation',
          description: 'Generate code in any programming language',
          inputSchema: { type: 'object', properties: { prompt: { type: 'string' }, language: { type: 'string' } } },
          outputSchema: { type: 'object', properties: { code: { type: 'string' } } },
        },
        {
          name: 'web-research',
          description: 'Research topics using web search and analysis',
          inputSchema: { type: 'object', properties: { query: { type: 'string' } } },
          outputSchema: { type: 'object', properties: { summary: { type: 'string' }, sources: { type: 'array' } } },
        },
        {
          name: 'data-analysis',
          description: 'Analyze data and generate insights',
          inputSchema: { type: 'object', properties: { data: { type: 'object' }, question: { type: 'string' } } },
          outputSchema: { type: 'object', properties: { analysis: { type: 'string' }, visualizations: { type: 'array' } } },
        },
      ],
      endpoints: {
        a2a: 'https://api.genesis.ai/a2a',
        health: 'https://api.genesis.ai/health',
        metrics: 'https://api.genesis.ai/metrics',
      },
      pricing: config?.pricing || {
        currency: 'USD',
        perRequest: 0.01,
      },
      authentication: {
        type: 'api-key',
      },
    });

    console.log('[GovernanceSystem] Initialized with agent card:', this.a2a.getSelfCard()?.name);
  }

  /**
   * Execute a governed action
   */
  async executeGoverned<T>(
    actor: string,
    action: string,
    resource: string,
    executor: () => Promise<T>,
    options?: { amount?: number; metadata?: Record<string, unknown> }
  ): Promise<{ success: boolean; result?: T; error?: string; approvalRequired?: boolean }> {
    // Check governance rules
    const permission = await this.governance.checkPermission({
      actor,
      action,
      resource,
      amount: options?.amount,
      metadata: options?.metadata,
    });

    if (!permission.allowed) {
      if (permission.requiresApproval) {
        return {
          success: false,
          error: 'Approval required',
          approvalRequired: true,
        };
      }
      return {
        success: false,
        error: `Denied by governance rule: ${permission.deniedBy}`,
      };
    }

    // Execute the action
    try {
      const result = await executor();
      return { success: true, result };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  /**
   * Set Slack notification channel for HITL
   */
  setSlackNotifications(webhookUrl: string): void {
    this.hitl.setNotificationChannel(async (message, data) => {
      try {
        await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: message,
            attachments: [{
              color: '#ff9800',
              fields: Object.entries(data as Record<string, unknown>).map(([k, v]) => ({
                title: k,
                value: String(v),
                short: true,
              })),
            }],
          }),
        });
      } catch (error) {
        console.error('[GovernanceSystem] Slack notification failed:', error);
      }
    });
  }

  /**
   * Get system status
   */
  getStatus(): {
    agent: AgentCard | null;
    governance: ReturnType<GovernanceEngine['getStats']>;
    pendingApprovals: ApprovalRequest[];
    activeTasks: TaskRequest[];
  } {
    return {
      agent: this.a2a.getSelfCard(),
      governance: this.governance.getStats(),
      pendingApprovals: this.hitl.getPendingReviews(),
      activeTasks: this.marketplace.listTasks({ status: 'executing' }),
    };
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

let governanceSystemInstance: GovernanceSystem | null = null;

export function getGovernanceSystem(): GovernanceSystem {
  if (!governanceSystemInstance) {
    governanceSystemInstance = new GovernanceSystem();
    governanceSystemInstance.initialize();
  }
  return governanceSystemInstance;
}

export default GovernanceSystem;
