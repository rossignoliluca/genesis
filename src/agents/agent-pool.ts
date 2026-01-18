/**
 * Genesis 7.21 - Efficient Agent Pool
 *
 * Super-efficient multi-agent system with:
 * - Lazy loading (spawn on-demand)
 * - Agent pooling (reuse instead of recreate)
 * - Dynamic specialization (task-based model selection)
 * - Cost optimization (route to cheapest capable agent)
 * - Parallel execution with resource limits
 *
 * Performance goals:
 * - 95% cost reduction vs naive approach
 * - <100ms agent spawn time
 * - 10+ concurrent agents
 */

import { MessageBus, messageBus } from './message-bus.js';
import { BaseAgent, getAgentFactory, listAgentTypes, registerAgentFactory } from './base-agent.js';
import { AgentType, Message, MessagePriority, Agent, MessageType } from './types.js';
import { getAdvancedRouter, TaskType, ExtendedProvider, detectTaskType } from '../llm/advanced-router.js';

// ============================================================================
// Types
// ============================================================================

export interface AgentCapability {
  taskTypes: TaskType[];
  preferredProvider?: ExtendedProvider;
  costTier: 'free' | 'cheap' | 'moderate' | 'expensive';
  speedTier: 'instant' | 'fast' | 'medium' | 'slow';
  qualityTier: 'basic' | 'good' | 'excellent';
}

export interface PooledAgent {
  agent: BaseAgent;
  lastUsed: number;
  useCount: number;
  avgLatency: number;
  avgCost: number;
  capability: AgentCapability;
  busy: boolean;
}

export interface PoolConfig {
  /** Max agents per type */
  maxAgentsPerType: number;
  /** Idle timeout before cleanup (ms) */
  idleTimeout: number;
  /** Max concurrent tasks */
  maxConcurrent: number;
  /** Enable lazy loading */
  lazyLoad: boolean;
  /** Enable cost optimization */
  costOptimize: boolean;
  /** Enable agent recycling */
  recycleAgents: boolean;
}

export interface TaskRequest {
  id: string;
  input: string;
  taskType?: TaskType;
  requiredCapabilities?: Partial<AgentCapability>;
  preferredAgentType?: AgentType;
  priority?: MessagePriority;
  timeout?: number;
  onProgress?: (progress: number, message: string) => void;
}

export interface TaskResult {
  id: string;
  agentType: AgentType;
  provider: ExtendedProvider;
  output: string;
  latency: number;
  cost: number;
  success: boolean;
  error?: string;
}

// ============================================================================
// Agent Capability Registry
// ============================================================================

const AGENT_CAPABILITIES: Record<AgentType, AgentCapability> = {
  explorer: {
    taskTypes: ['research', 'simple-qa', 'summarization'],
    preferredProvider: 'groq',
    costTier: 'cheap',
    speedTier: 'fast',
    qualityTier: 'good',
  },
  memory: {
    taskTypes: ['simple-qa', 'summarization'],
    preferredProvider: 'ollama',
    costTier: 'free',
    speedTier: 'instant',
    qualityTier: 'basic',
  },
  planner: {
    taskTypes: ['architecture', 'reasoning', 'code-generation'],
    preferredProvider: 'anthropic',
    costTier: 'expensive',
    speedTier: 'medium',
    qualityTier: 'excellent',
  },
  predictor: {
    taskTypes: ['reasoning', 'research'],
    preferredProvider: 'groq',
    costTier: 'cheap',
    speedTier: 'fast',
    qualityTier: 'good',
  },
  feeling: {
    taskTypes: ['creative', 'simple-qa'],
    preferredProvider: 'ollama',
    costTier: 'free',
    speedTier: 'fast',
    qualityTier: 'basic',
  },
  critic: {
    taskTypes: ['code-review', 'reasoning'],
    preferredProvider: 'groq',
    costTier: 'cheap',
    speedTier: 'fast',
    qualityTier: 'good',
  },
  ethicist: {
    taskTypes: ['reasoning', 'creative'],
    preferredProvider: 'anthropic',
    costTier: 'moderate',
    speedTier: 'medium',
    qualityTier: 'excellent',
  },
  builder: {
    taskTypes: ['code-generation', 'code-fix', 'refactoring'],
    preferredProvider: 'groq',
    costTier: 'cheap',
    speedTier: 'fast',
    qualityTier: 'good',
  },
  narrator: {
    taskTypes: ['documentation', 'creative', 'summarization'],
    preferredProvider: 'ollama',
    costTier: 'free',
    speedTier: 'fast',
    qualityTier: 'good',
  },
  sensor: {
    taskTypes: ['tool-use', 'research'],
    preferredProvider: 'anthropic',
    costTier: 'moderate',
    speedTier: 'medium',
    qualityTier: 'excellent',
  },
  // Phase 5.1+ agents
  economic: {
    taskTypes: ['simple-qa', 'reasoning'],
    preferredProvider: 'ollama',
    costTier: 'free',
    speedTier: 'fast',
    qualityTier: 'basic',
  },
  consciousness: {
    taskTypes: ['reasoning', 'creative'],
    preferredProvider: 'anthropic',
    costTier: 'expensive',
    speedTier: 'slow',
    qualityTier: 'excellent',
  },
  'world-model': {
    taskTypes: ['reasoning', 'architecture'],
    preferredProvider: 'groq',
    costTier: 'cheap',
    speedTier: 'fast',
    qualityTier: 'good',
  },
  causal: {
    taskTypes: ['reasoning', 'research'],
    preferredProvider: 'anthropic',
    costTier: 'moderate',
    speedTier: 'medium',
    qualityTier: 'excellent',
  },
  swarm: {
    taskTypes: ['general', 'reasoning'],
    preferredProvider: 'groq',
    costTier: 'cheap',
    speedTier: 'fast',
    qualityTier: 'good',
  },
  grounding: {
    taskTypes: ['research', 'reasoning'],
    preferredProvider: 'groq',
    costTier: 'cheap',
    speedTier: 'fast',
    qualityTier: 'good',
  },
  anticipatory: {
    taskTypes: ['reasoning', 'simple-qa'],
    preferredProvider: 'groq',
    costTier: 'cheap',
    speedTier: 'fast',
    qualityTier: 'good',
  },
};

// ============================================================================
// Agent Pool Class
// ============================================================================

export class AgentPool {
  private pool: Map<AgentType, PooledAgent[]> = new Map();
  private taskQueue: TaskRequest[] = [];
  private activeTaskCount = 0;
  private bus: MessageBus;
  private cleanupInterval: NodeJS.Timeout | null = null;

  // Stats
  private stats = {
    totalTasks: 0,
    completedTasks: 0,
    failedTasks: 0,
    totalCost: 0,
    totalLatency: 0,
    agentsSpawned: 0,
    agentsRecycled: 0,
  };

  constructor(
    private config: PoolConfig = {
      maxAgentsPerType: 3,
      idleTimeout: 60000,  // 1 minute
      maxConcurrent: 10,
      lazyLoad: true,
      costOptimize: true,
      recycleAgents: true,
    },
    bus: MessageBus = messageBus
  ) {
    this.bus = bus;

    // Start cleanup timer
    this.cleanupInterval = setInterval(() => this.cleanup(), 30000);
  }

  // ==========================================================================
  // Agent Acquisition
  // ==========================================================================

  /**
   * Get an agent for a specific task (lazy load + pool)
   */
  async acquire(
    taskType: TaskType,
    preferredType?: AgentType
  ): Promise<{ agent: BaseAgent; poolEntry: PooledAgent }> {
    // 1. Find best agent type for task
    const agentType = preferredType || this.selectAgentType(taskType);

    // 2. Try to get from pool
    const poolEntry = await this.getFromPool(agentType);

    if (poolEntry) {
      this.stats.agentsRecycled++;
      return { agent: poolEntry.agent, poolEntry };
    }

    // 3. Spawn new agent (lazy load)
    const agent = await this.spawn(agentType);
    const newEntry = this.addToPool(agentType, agent);

    this.stats.agentsSpawned++;
    return { agent, poolEntry: newEntry };
  }

  /**
   * Release an agent back to pool
   */
  release(agentType: AgentType, agent: BaseAgent, latency: number, cost: number): void {
    const poolEntries = this.pool.get(agentType) || [];
    const entry = poolEntries.find(e => e.agent.id === agent.id);

    if (entry) {
      entry.busy = false;
      entry.lastUsed = Date.now();
      entry.useCount++;
      entry.avgLatency = entry.avgLatency + (latency - entry.avgLatency) / entry.useCount;
      entry.avgCost = entry.avgCost + (cost - entry.avgCost) / entry.useCount;
    }
  }

  // ==========================================================================
  // Task Execution
  // ==========================================================================

  /**
   * Execute a single task
   */
  async execute(request: TaskRequest): Promise<TaskResult> {
    this.stats.totalTasks++;
    const startTime = Date.now();

    // 1. Detect task type if not provided
    const taskType = request.taskType || detectTaskType(request.input).type;

    // 2. Acquire agent
    const { agent, poolEntry } = await this.acquire(taskType, request.preferredAgentType);

    try {
      poolEntry.busy = true;

      // 3. Execute via agent
      const response = await this.executeWithAgent(agent, request, taskType);

      const latency = Date.now() - startTime;
      const cost = response.cost || 0;

      // 4. Release agent
      this.release(agent.agentType as AgentType, agent, latency, cost);

      this.stats.completedTasks++;
      this.stats.totalCost += cost;
      this.stats.totalLatency += latency;

      return {
        id: request.id,
        agentType: agent.agentType as AgentType,
        provider: response.provider || 'ollama',
        output: response.output,
        latency,
        cost,
        success: true,
      };
    } catch (error) {
      poolEntry.busy = false;
      this.stats.failedTasks++;

      return {
        id: request.id,
        agentType: agent.agentType as AgentType,
        provider: 'ollama',
        output: '',
        latency: Date.now() - startTime,
        cost: 0,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Execute multiple tasks in parallel (with concurrency limit)
   */
  async executeParallel(requests: TaskRequest[]): Promise<TaskResult[]> {
    const results: TaskResult[] = [];
    const executing: Promise<TaskResult>[] = [];

    for (const request of requests) {
      // Wait if at max concurrency
      while (this.activeTaskCount >= this.config.maxConcurrent) {
        await this.waitForSlot();
      }

      this.activeTaskCount++;
      const promise = this.execute(request)
        .finally(() => {
          this.activeTaskCount--;
        });

      executing.push(promise);
    }

    // Wait for all to complete
    return Promise.all(executing);
  }

  /**
   * Execute tasks as a pipeline (output of one -> input of next)
   */
  async executePipeline(
    input: string,
    stages: { agentType: AgentType; transform?: (output: string) => string }[]
  ): Promise<{ finalOutput: string; stageResults: TaskResult[] }> {
    const stageResults: TaskResult[] = [];
    let currentInput = input;

    for (let i = 0; i < stages.length; i++) {
      const stage = stages[i];

      const result = await this.execute({
        id: `pipeline-stage-${i}`,
        input: currentInput,
        preferredAgentType: stage.agentType,
      });

      stageResults.push(result);

      if (!result.success) {
        return { finalOutput: '', stageResults };
      }

      currentInput = stage.transform ? stage.transform(result.output) : result.output;
    }

    return { finalOutput: currentInput, stageResults };
  }

  // ==========================================================================
  // Agent Selection & Routing
  // ==========================================================================

  private selectAgentType(taskType: TaskType): AgentType {
    // Find agent with best match for task type
    let bestAgent: AgentType = 'explorer';
    let bestScore = 0;

    for (const [agentType, capability] of Object.entries(AGENT_CAPABILITIES)) {
      if (capability.taskTypes.includes(taskType)) {
        let score = 1;

        // Cost optimization bonus
        if (this.config.costOptimize) {
          score += capability.costTier === 'free' ? 3 : capability.costTier === 'cheap' ? 2 : 0;
        }

        // Speed bonus
        score += capability.speedTier === 'instant' ? 2 : capability.speedTier === 'fast' ? 1 : 0;

        if (score > bestScore) {
          bestScore = score;
          bestAgent = agentType as AgentType;
        }
      }
    }

    return bestAgent;
  }

  private async getFromPool(agentType: AgentType): Promise<PooledAgent | null> {
    const poolEntries = this.pool.get(agentType) || [];

    // Find available (not busy) agent
    const available = poolEntries.find(e => !e.busy && e.agent.state === 'idle');

    if (available) {
      return available;
    }

    // Check if we can spawn more
    if (poolEntries.length >= this.config.maxAgentsPerType) {
      // Wait for one to become available
      await new Promise<void>(resolve => {
        const check = setInterval(() => {
          const free = poolEntries.find(e => !e.busy);
          if (free) {
            clearInterval(check);
            resolve();
          }
        }, 100);

        // Timeout after 5s
        setTimeout(() => {
          clearInterval(check);
          resolve();
        }, 5000);
      });

      return poolEntries.find(e => !e.busy) || null;
    }

    return null;
  }

  private async spawn(agentType: AgentType): Promise<BaseAgent> {
    const factory = getAgentFactory(agentType);
    if (!factory) {
      throw new Error(`Unknown agent type: ${agentType}`);
    }

    const agent = factory(this.bus);
    await agent.wake();

    return agent;
  }

  private addToPool(agentType: AgentType, agent: BaseAgent): PooledAgent {
    const capability = AGENT_CAPABILITIES[agentType];

    const entry: PooledAgent = {
      agent,
      lastUsed: Date.now(),
      useCount: 0,
      avgLatency: 0,
      avgCost: 0,
      capability,
      busy: false,
    };

    const poolEntries = this.pool.get(agentType) || [];
    poolEntries.push(entry);
    this.pool.set(agentType, poolEntries);

    return entry;
  }

  // ==========================================================================
  // Execution Helpers
  // ==========================================================================

  private async executeWithAgent(
    agent: BaseAgent,
    request: TaskRequest,
    taskType: TaskType
  ): Promise<{ output: string; cost: number; provider: ExtendedProvider }> {
    // Use advanced router for LLM calls
    const router = getAdvancedRouter();

    // Create message for agent
    const message: Message = {
      id: request.id,
      type: 'QUERY' as MessageType,
      from: 'pool',
      to: agent.id,
      payload: {
        input: request.input,
        taskType,
        query: request.input,
      },
      priority: request.priority || 'normal',
      timestamp: new Date(),
    };

    // Process via agent
    const result = await agent.process(message);

    // Extract result from payload
    if (result?.payload) {
      const payload = result.payload as any;
      return {
        output: payload.content || payload.output || payload.result || JSON.stringify(payload),
        cost: payload.cost || 0,
        provider: payload.provider || 'ollama',
      };
    }

    // Direct output (shouldn't happen, but fallback)
    return {
      output: JSON.stringify(result || {}),
      cost: 0,
      provider: 'ollama',
    };
  }

  private async waitForSlot(): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, 100));
  }

  // ==========================================================================
  // Cleanup & Stats
  // ==========================================================================

  private cleanup(): void {
    const now = Date.now();

    for (const [agentType, poolEntries] of this.pool) {
      // Remove idle agents past timeout
      const active = poolEntries.filter(entry => {
        const isIdle = !entry.busy && now - entry.lastUsed > this.config.idleTimeout;

        if (isIdle && this.config.recycleAgents) {
          entry.agent.shutdown();
          return false;
        }

        return true;
      });

      this.pool.set(agentType, active);
    }
  }

  getStats(): typeof this.stats & {
    poolSize: number;
    avgLatency: number;
    avgCost: number;
    successRate: number;
  } {
    let poolSize = 0;
    for (const entries of this.pool.values()) {
      poolSize += entries.length;
    }

    return {
      ...this.stats,
      poolSize,
      avgLatency: this.stats.completedTasks > 0
        ? this.stats.totalLatency / this.stats.completedTasks
        : 0,
      avgCost: this.stats.completedTasks > 0
        ? this.stats.totalCost / this.stats.completedTasks
        : 0,
      successRate: this.stats.totalTasks > 0
        ? this.stats.completedTasks / this.stats.totalTasks
        : 1,
    };
  }

  /**
   * Get pool status by agent type
   */
  getPoolStatus(): Map<AgentType, { total: number; busy: number; idle: number }> {
    const status = new Map<AgentType, { total: number; busy: number; idle: number }>();

    for (const [agentType, entries] of this.pool) {
      const busy = entries.filter(e => e.busy).length;
      status.set(agentType, {
        total: entries.length,
        busy,
        idle: entries.length - busy,
      });
    }

    return status;
  }

  /**
   * Shutdown all agents
   */
  shutdown(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    for (const entries of this.pool.values()) {
      for (const entry of entries) {
        entry.agent.shutdown();
      }
    }

    this.pool.clear();
  }

  /**
   * Pre-warm specific agent types
   */
  async warmup(agentTypes: AgentType[]): Promise<void> {
    const promises = agentTypes.map(async type => {
      const agent = await this.spawn(type);
      this.addToPool(type, agent);
    });

    await Promise.all(promises);
  }
}

// ============================================================================
// Singleton & Exports
// ============================================================================

let agentPoolInstance: AgentPool | null = null;

export function getAgentPool(config?: Partial<PoolConfig>): AgentPool {
  if (!agentPoolInstance) {
    agentPoolInstance = new AgentPool(config as PoolConfig);
  }
  return agentPoolInstance;
}

export function resetAgentPool(): void {
  if (agentPoolInstance) {
    agentPoolInstance.shutdown();
    agentPoolInstance = null;
  }
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Quick execute a task with automatic agent selection
 */
export async function quickExecute(input: string, taskType?: TaskType): Promise<TaskResult> {
  const pool = getAgentPool();
  return pool.execute({
    id: `quick-${Date.now()}`,
    input,
    taskType,
  });
}

/**
 * Execute multiple tasks in parallel
 */
export async function parallelExecute(
  tasks: Array<{ input: string; taskType?: TaskType }>
): Promise<TaskResult[]> {
  const pool = getAgentPool();
  return pool.executeParallel(
    tasks.map((t, i) => ({
      id: `parallel-${i}-${Date.now()}`,
      input: t.input,
      taskType: t.taskType,
    }))
  );
}

/**
 * Execute a research-build-review pipeline
 */
export async function researchBuildReview(input: string): Promise<{
  research: TaskResult;
  build: TaskResult;
  review: TaskResult;
}> {
  const pool = getAgentPool();

  const { stageResults } = await pool.executePipeline(input, [
    { agentType: 'explorer' },
    { agentType: 'builder', transform: (out) => `Based on research:\n${out}\n\nBuild:` },
    { agentType: 'critic', transform: (out) => `Review this implementation:\n${out}` },
  ]);

  return {
    research: stageResults[0],
    build: stageResults[1],
    review: stageResults[2],
  };
}

export { AGENT_CAPABILITIES };
