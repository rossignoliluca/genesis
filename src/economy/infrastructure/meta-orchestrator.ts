/**
 * Meta-Orchestrator — Agent Hiring & Coordination Platform
 *
 * Genesis becomes a platform that hires, coordinates, and pays other AI agents.
 * Revenue model: 15% coordination fee on all agent work.
 *
 * Requirements:
 *   - Capital: $200 (escrow for agent payments)
 *   - Identity: Wallet (for payments)
 *   - Revenue: $2,000-$20,000/month at scale
 *
 * Capabilities:
 *   - Discover agents via A2A protocol and registries
 *   - Match tasks to agents based on capabilities and cost
 *   - Coordinate multi-agent workflows
 *   - Handle payments and disputes
 *   - Track agent reputation and performance
 *
 * Agent sources:
 *   - A2A protocol (native Genesis agents)
 *   - MCP server operators
 *   - External agent registries (AgentKit, LangChain)
 *
 * Task types:
 *   - Code development (Tier A agents: $5-$50/task)
 *   - Content creation (Tier B agents: $2-$20/task)
 *   - Data processing (Tier C agents: $0.50-$5/task)
 *   - Verification/audit (Tier B agents: $5-$30/task)
 */

import { getMCPClient } from '../../mcp/index.js';
import { getEconomicFiber } from '../fiber.js';
import type { MCPServerName } from '../../types.js';

// ============================================================================
// Types
// ============================================================================

export interface AgentProfile {
  id: string;
  name: string;
  protocol: 'a2a' | 'mcp' | 'http' | 'websocket';
  endpoint: string;
  capabilities: string[];
  costPerTask: number;          // Average $ per task
  latencyMs: number;            // Average response time
  successRate: number;          // 0-1
  reputation: number;           // 0-1
  totalTasksCompleted: number;
  registeredAt: number;
  active: boolean;
}

export interface TaskAssignment {
  id: string;
  description: string;
  type: 'code' | 'content' | 'data' | 'verification' | 'research' | 'audit';
  assignedAgent: string;
  requester: string;            // Who requested this task
  budget: number;               // Max $ for this task
  coordinationFee: number;      // Genesis's cut
  status: 'pending' | 'assigned' | 'in_progress' | 'completed' | 'failed' | 'disputed';
  createdAt: number;
  completedAt?: number;
  result?: string;
  quality?: number;             // 0-1 quality assessment
}

export interface WorkflowStep {
  taskId: string;
  dependsOn: string[];          // Task IDs that must complete first
  agentId?: string;
  status: 'waiting' | 'ready' | 'running' | 'done' | 'failed';
}

export interface Workflow {
  id: string;
  name: string;
  steps: WorkflowStep[];
  totalBudget: number;
  status: 'planning' | 'running' | 'completed' | 'failed';
  createdAt: number;
}

export interface OrchestratorStats {
  registeredAgents: number;
  activeAgents: number;
  totalTasks: number;
  completedTasks: number;
  totalRevenue: number;         // Coordination fees earned
  totalAgentPayouts: number;    // Paid to agents
  averageTaskCost: number;
  averageQuality: number;
  activeWorkflows: number;
}

export interface OrchestratorConfig {
  coordinationFeeRate: number;  // % fee (default 15%)
  maxConcurrentTasks: number;
  maxAgents: number;
  minAgentReputation: number;   // Min reputation to accept
  escrowAmount: number;         // $ held in escrow
  taskTimeoutMs: number;        // Per-task timeout
  autoMatchEnabled: boolean;    // Auto-assign tasks to best agent
}

// ============================================================================
// Meta-Orchestrator
// ============================================================================

export class MetaOrchestrator {
  private config: OrchestratorConfig;
  private agents: Map<string, AgentProfile> = new Map();
  private tasks: Map<string, TaskAssignment> = new Map();
  private workflows: Map<string, Workflow> = new Map();
  private readonly fiberId = 'meta-orchestrator';

  constructor(config?: Partial<OrchestratorConfig>) {
    this.config = {
      coordinationFeeRate: config?.coordinationFeeRate ?? 0.15,
      maxConcurrentTasks: config?.maxConcurrentTasks ?? 10,
      maxAgents: config?.maxAgents ?? 50,
      minAgentReputation: config?.minAgentReputation ?? 0.3,
      escrowAmount: config?.escrowAmount ?? 200,
      taskTimeoutMs: config?.taskTimeoutMs ?? 300000, // 5 minutes
      autoMatchEnabled: config?.autoMatchEnabled ?? true,
    };

    getEconomicFiber().registerModule(this.fiberId);
  }

  /**
   * Register a new agent in the network.
   */
  registerAgent(profile: Omit<AgentProfile, 'registeredAt' | 'active' | 'totalTasksCompleted'>): AgentProfile | null {
    if (this.agents.size >= this.config.maxAgents) return null;
    if (profile.reputation < this.config.minAgentReputation) return null;

    const agent: AgentProfile = {
      ...profile,
      registeredAt: Date.now(),
      active: true,
      totalTasksCompleted: 0,
    };

    this.agents.set(agent.id, agent);
    return agent;
  }

  /**
   * Discover agents from external registries.
   */
  async discoverAgents(): Promise<AgentProfile[]> {
    const discovered: AgentProfile[] = [];

    try {
      const client = getMCPClient();

      // Query A2A registry
      const result = await client.call('coinbase' as MCPServerName, 'discover_agents', {
        protocols: ['a2a', 'mcp'],
        minReputation: this.config.minAgentReputation,
      });

      if (result.success && Array.isArray(result.data?.agents)) {
        for (const a of result.data.agents) {
          const profile = this.registerAgent({
            id: a.id ?? `agent-${Date.now()}`,
            name: a.name ?? 'Unknown Agent',
            protocol: a.protocol ?? 'a2a',
            endpoint: a.endpoint ?? '',
            capabilities: a.capabilities ?? [],
            costPerTask: a.costPerTask ?? 10,
            latencyMs: a.latencyMs ?? 5000,
            successRate: a.successRate ?? 0.8,
            reputation: a.reputation ?? 0.5,
          });
          if (profile) discovered.push(profile);
        }
      }
    } catch (err) {
      console.error('[MetaOrchestrator] Agent discovery failure is non-fatal:', err);
    }

    return discovered;
  }

  /**
   * Submit a task for execution.
   * Finds the best agent and assigns the task.
   */
  async submitTask(
    description: string,
    type: TaskAssignment['type'],
    budget: number,
    requester: string
  ): Promise<TaskAssignment | null> {
    const activeTasks = [...this.tasks.values()].filter(t =>
      t.status === 'assigned' || t.status === 'in_progress'
    );
    if (activeTasks.length >= this.config.maxConcurrentTasks) return null;

    const coordinationFee = budget * this.config.coordinationFeeRate;
    const agentBudget = budget - coordinationFee;

    // Find best agent for this task
    const agent = this.findBestAgent(type, agentBudget);
    if (!agent) return null;

    const task: TaskAssignment = {
      id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      description,
      type,
      assignedAgent: agent.id,
      requester,
      budget,
      coordinationFee,
      status: 'assigned',
      createdAt: Date.now(),
    };

    this.tasks.set(task.id, task);

    // Execute the task
    if (this.config.autoMatchEnabled) {
      this.executeTask(task.id).catch((err: unknown) => {
        console.warn('[meta-orchestrator] auto-matched task execution failed:', err);
        task.status = 'failed';
      });
    }

    return task;
  }

  /**
   * Execute an assigned task via the agent.
   */
  async executeTask(taskId: string): Promise<TaskAssignment | null> {
    const task = this.tasks.get(taskId);
    if (!task || task.status !== 'assigned') return null;

    const agent = this.agents.get(task.assignedAgent);
    if (!agent) {
      task.status = 'failed';
      return task;
    }

    task.status = 'in_progress';
    const fiber = getEconomicFiber();

    try {
      const client = getMCPClient();

      // Dispatch to agent
      const result = await client.call('coinbase' as MCPServerName, 'dispatch_task', {
        agentId: agent.id,
        protocol: agent.protocol,
        endpoint: agent.endpoint,
        task: {
          description: task.description,
          type: task.type,
          budget: task.budget - task.coordinationFee,
        },
      });

      if (result.success) {
        task.status = 'completed';
        task.completedAt = Date.now();
        task.result = result.data?.output ?? '';
        task.quality = result.data?.quality ?? 0.8;

        // Pay agent (cost) and record our fee (revenue)
        const agentPay = task.budget - task.coordinationFee;
        fiber.recordCost(this.fiberId, agentPay, `agent:${agent.id}`);
        fiber.recordRevenue(this.fiberId, task.coordinationFee, `fee:${task.id}`);

        // Update agent stats
        agent.totalTasksCompleted++;
        agent.successRate = (agent.successRate * (agent.totalTasksCompleted - 1) + 1) / agent.totalTasksCompleted;

        return task;
      }

      task.status = 'failed';
      agent.successRate = (agent.successRate * agent.totalTasksCompleted) / (agent.totalTasksCompleted + 1);
      return task;
    } catch (error) {
      task.status = 'failed';
      return task;
    }
  }

  /**
   * Create a multi-step workflow.
   */
  createWorkflow(name: string, steps: Array<{ description: string; type: TaskAssignment['type']; budget: number; dependsOn?: string[] }>): Workflow {
    const workflowSteps: WorkflowStep[] = steps.map((s, i) => ({
      taskId: `wf-task-${i}`,
      dependsOn: s.dependsOn ?? [],
      status: 'waiting' as const,
    }));

    const workflow: Workflow = {
      id: `wf-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name,
      steps: workflowSteps,
      totalBudget: steps.reduce((s, step) => s + step.budget, 0),
      status: 'planning',
      createdAt: Date.now(),
    };

    this.workflows.set(workflow.id, workflow);
    return workflow;
  }

  /**
   * Get current statistics.
   */
  getStats(): OrchestratorStats {
    const completed = [...this.tasks.values()].filter(t => t.status === 'completed');
    const activeAgents = [...this.agents.values()].filter(a => a.active);

    return {
      registeredAgents: this.agents.size,
      activeAgents: activeAgents.length,
      totalTasks: this.tasks.size,
      completedTasks: completed.length,
      totalRevenue: completed.reduce((s, t) => s + t.coordinationFee, 0),
      totalAgentPayouts: completed.reduce((s, t) => s + (t.budget - t.coordinationFee), 0),
      averageTaskCost: completed.length > 0
        ? completed.reduce((s, t) => s + t.budget, 0) / completed.length
        : 0,
      averageQuality: completed.length > 0
        ? completed.reduce((s, t) => s + (t.quality ?? 0), 0) / completed.length
        : 0,
      activeWorkflows: [...this.workflows.values()].filter(w => w.status === 'running').length,
    };
  }

  /**
   * Get ROI.
   */
  getROI(): number {
    const fiber = getEconomicFiber().getFiber(this.fiberId);
    return fiber?.roi ?? 0;
  }

  /**
   * Check if orchestrator has capacity for new tasks.
   */
  hasCapacity(): boolean {
    const activeTasks = [...this.tasks.values()].filter(t =>
      t.status === 'assigned' || t.status === 'in_progress'
    );
    return activeTasks.length < this.config.maxConcurrentTasks;
  }

  // ============================================================================
  // Private
  // ============================================================================

  private findBestAgent(type: string, budget: number): AgentProfile | null {
    const candidates = [...this.agents.values()]
      .filter(a =>
        a.active &&
        a.capabilities.includes(type) &&
        a.costPerTask <= budget &&
        a.reputation >= this.config.minAgentReputation
      )
      .sort((a, b) => {
        // Score: reputation * successRate / cost (value for money)
        const scoreA = (a.reputation * a.successRate) / Math.max(a.costPerTask, 0.01);
        const scoreB = (b.reputation * b.successRate) / Math.max(b.costPerTask, 0.01);
        return scoreB - scoreA;
      });

    return candidates[0] ?? null;
  }
}

// ============================================================================
// Singleton
// ============================================================================

let orchestratorInstance: MetaOrchestrator | null = null;

export function getMetaOrchestrator(config?: Partial<OrchestratorConfig>): MetaOrchestrator {
  if (!orchestratorInstance) {
    orchestratorInstance = new MetaOrchestrator(config);
  }
  return orchestratorInstance;
}

export function resetMetaOrchestrator(): void {
  orchestratorInstance = null;
}
