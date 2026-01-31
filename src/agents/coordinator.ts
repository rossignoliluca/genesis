/**
 * Genesis 7.6 - Multi-Agent Coordinator
 *
 * Orchestrates collaboration between multiple agents using various patterns:
 * - Sequential Pipeline: A → B → C
 * - Parallel Fan-Out: A → [B, C, D] → gather
 * - Debate: Multiple agents discuss and reach consensus
 * - Voting: Democratic decision-making
 * - Hierarchical: Supervisor delegates to workers
 * - Swarm: Emergent coordination without central control
 *
 * Based on:
 * - LangGraph multi-agent patterns
 * - AWS Agent Squad architecture
 * - Microsoft AutoGen patterns
 */

import { randomUUID } from 'crypto';
import { EventEmitter } from 'events';
import {
  AgentId,
  AgentType,
  Message,
  MessageType,
  MessagePriority,
  Plan,
  PlanStep,
  Critique,
  EthicalDecision,
  Feeling,
  Prediction,
} from './types.js';
import { MessageBus, messageBus } from './message-bus.js';
import { getAgentPool, AgentPool } from './agent-pool.js';
import { detectTaskType } from '../llm/advanced-router.js';

// ============================================================================
// Coordination Types
// ============================================================================

export type CoordinationPattern =
  | 'sequential'    // A → B → C
  | 'parallel'      // A → [B, C, D] → gather
  | 'debate'        // Multiple agents argue positions
  | 'voting'        // Democratic voting
  | 'consensus'     // Must reach agreement
  | 'hierarchical'  // Supervisor → workers
  | 'swarm'         // Self-organizing
  | 'round-robin';  // Rotate through agents

export type AggregationStrategy =
  | 'first'         // First response wins
  | 'all'           // Wait for all
  | 'majority'      // Majority vote
  | 'weighted'      // Weighted by confidence/score
  | 'best'          // Highest score wins
  | 'merge';        // Combine all results

export interface CoordinationTask {
  id: string;
  pattern: CoordinationPattern;
  query: string;
  context?: Record<string, unknown>;
  agents: AgentType[];
  aggregation: AggregationStrategy;
  timeout: number;
  priority: MessagePriority;
  createdAt: Date;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'timeout';
  results: AgentResponse[];
  finalResult?: unknown;
  error?: string;
}

export interface AgentResponse {
  agentId: AgentId;
  agentType: AgentType;
  response: unknown;
  confidence: number;
  latency: number;
  timestamp: Date;
}

export interface WorkflowStep {
  id: string;
  name: string;
  agents: AgentType[];
  pattern: CoordinationPattern;
  aggregation: AggregationStrategy;
  messageType: MessageType;
  transform?: (input: unknown, context: WorkflowContext) => unknown;
  condition?: (context: WorkflowContext) => boolean;
  retries?: number;
  timeout?: number;
}

export interface Workflow {
  id: string;
  name: string;
  description: string;
  steps: WorkflowStep[];
  onError?: 'stop' | 'skip' | 'retry';
  maxRetries?: number;
}

export interface WorkflowContext {
  workflowId: string;
  currentStep: number;
  results: Map<string, unknown>;
  metadata: Record<string, unknown>;
  startTime: Date;
  errors: string[];
}

export interface DebateConfig {
  maxRounds: number;
  convergenceThreshold: number;
  moderator?: AgentType;
  allowAbstain: boolean;
  requireUnanimity: boolean;
}

export interface VoteResult {
  option: string;
  votes: number;
  voters: AgentId[];
  percentage: number;
}

// ============================================================================
// Agent Capabilities Registry
// ============================================================================

const AGENT_CAPABILITIES: Record<AgentType, {
  skills: string[];
  inputTypes: MessageType[];
  outputTypes: MessageType[];
  priority: number;
}> = {
  explorer: {
    skills: ['search', 'discover', 'research', 'find'],
    inputTypes: ['QUERY', 'COMMAND'],
    outputTypes: ['EXPLORATION', 'RESPONSE'],
    priority: 3,
  },
  critic: {
    skills: ['review', 'critique', 'validate', 'check'],
    inputTypes: ['QUERY', 'BUILD_RESULT'],
    outputTypes: ['CRITIQUE', 'RESPONSE'],
    priority: 4,
  },
  builder: {
    skills: ['build', 'create', 'implement', 'generate'],
    inputTypes: ['BUILD_REQUEST', 'COMMAND'],
    outputTypes: ['BUILD_RESULT', 'RESPONSE'],
    priority: 5,
  },
  memory: {
    skills: ['store', 'retrieve', 'remember', 'recall'],
    inputTypes: ['MEMORY_STORE', 'MEMORY_RETRIEVE', 'QUERY'],
    outputTypes: ['RESPONSE'],
    priority: 2,
  },
  feeling: {
    skills: ['evaluate', 'importance', 'emotion', 'sentiment'],
    inputTypes: ['QUERY', 'EVENT'],
    outputTypes: ['FEELING', 'RESPONSE'],
    priority: 1,
  },
  narrator: {
    skills: ['summarize', 'narrate', 'explain', 'story'],
    inputTypes: ['NARRATE', 'QUERY'],
    outputTypes: ['RESPONSE'],
    priority: 6,
  },
  ethicist: {
    skills: ['ethics', 'safety', 'approve', 'reject'],
    inputTypes: ['ETHICAL_CHECK', 'QUERY'],
    outputTypes: ['RESPONSE'],
    priority: 0, // Highest priority for safety
  },
  predictor: {
    skills: ['predict', 'forecast', 'anticipate', 'estimate'],
    inputTypes: ['PREDICT', 'QUERY'],
    outputTypes: ['PREDICTION', 'RESPONSE'],
    priority: 3,
  },
  planner: {
    skills: ['plan', 'decompose', 'schedule', 'organize'],
    inputTypes: ['QUERY', 'COMMAND'],
    outputTypes: ['PLAN', 'RESPONSE'],
    priority: 2,
  },
  sensor: {
    skills: ['sense', 'observe', 'monitor', 'mcp'],
    inputTypes: ['SENSE', 'QUERY'],
    outputTypes: ['RESPONSE'],
    priority: 1,
  },
  // Future agents - placeholder capabilities
  economic: {
    skills: ['cost', 'budget', 'optimize'],
    inputTypes: ['COST_TRACK', 'BUDGET_CHECK'],
    outputTypes: ['RESPONSE'],
    priority: 4,
  },
  consciousness: {
    skills: ['awareness', 'attention', 'phi'],
    inputTypes: ['PHI_CHECK', 'GWT_BROADCAST'],
    outputTypes: ['PHI_REPORT', 'RESPONSE'],
    priority: 0,
  },
  'world-model': {
    skills: ['simulate', 'predict', 'encode'],
    inputTypes: ['WORLD_PREDICT', 'WORLD_SIMULATE'],
    outputTypes: ['RESPONSE'],
    priority: 3,
  },
  causal: {
    skills: ['cause', 'effect', 'intervene'],
    inputTypes: ['INTERVENTION', 'COUNTERFACTUAL'],
    outputTypes: ['RESPONSE'],
    priority: 4,
  },
  swarm: {
    skills: ['collective', 'emerge', 'coordinate'],
    inputTypes: ['SWARM_UPDATE'],
    outputTypes: ['EMERGENCE', 'RESPONSE'],
    priority: 5,
  },
  grounding: {
    skills: ['ground', 'verify', 'ontology'],
    inputTypes: ['GROUND_CLAIM'],
    outputTypes: ['RESPONSE'],
    priority: 3,
  },
  anticipatory: {
    skills: ['anticipate', 'regulate', 'preempt'],
    inputTypes: ['QUERY'],
    outputTypes: ['RESPONSE'],
    priority: 2,
  },
};

// ============================================================================
// Multi-Agent Coordinator
// ============================================================================

export class AgentCoordinator extends EventEmitter {
  private bus: MessageBus;
  private pool: AgentPool;
  private tasks: Map<string, CoordinationTask> = new Map();
  private workflows: Map<string, Workflow> = new Map();
  private subscriptionId: string | null = null;

  // Metrics
  private metrics = {
    tasksCreated: 0,
    tasksCompleted: 0,
    tasksFailed: 0,
    totalLatency: 0,
    workflowsRun: 0,
    debatesHeld: 0,
    votesHeld: 0,
    poolAcquires: 0,
    poolReleases: 0,
  };

  constructor(bus: MessageBus = messageBus) {
    super();
    this.bus = bus;
    this.pool = getAgentPool();
    this.registerBuiltinWorkflows();
  }

  // ============================================================================
  // Core Coordination Methods
  // ============================================================================

  /**
   * Execute a coordinated task across multiple agents
   */
  async coordinate(options: {
    query: string;
    agents: AgentType[];
    pattern?: CoordinationPattern;
    aggregation?: AggregationStrategy;
    context?: Record<string, unknown>;
    timeout?: number;
    priority?: MessagePriority;
  }): Promise<CoordinationTask> {
    const task: CoordinationTask = {
      id: randomUUID(),
      pattern: options.pattern || 'parallel',
      query: options.query,
      context: options.context,
      agents: options.agents,
      aggregation: options.aggregation || 'all',
      timeout: options.timeout || 30000,
      priority: options.priority || 'normal',
      createdAt: new Date(),
      status: 'pending',
      results: [],
    };

    this.tasks.set(task.id, task);
    this.metrics.tasksCreated++;

    try {
      task.status = 'running';
      this.emit('task:start', task);

      switch (task.pattern) {
        case 'sequential':
          await this.executeSequential(task);
          break;
        case 'parallel':
          await this.executeParallel(task);
          break;
        case 'debate':
          await this.executeDebate(task);
          break;
        case 'voting':
          await this.executeVoting(task);
          break;
        case 'consensus':
          await this.executeConsensus(task);
          break;
        case 'hierarchical':
          await this.executeHierarchical(task);
          break;
        case 'round-robin':
          await this.executeRoundRobin(task);
          break;
        default:
          await this.executeParallel(task);
      }

      task.finalResult = this.aggregate(task.results, task.aggregation);
      task.status = 'completed';
      this.metrics.tasksCompleted++;
      this.emit('task:complete', task);

      // v9.2.0: Auto-cleanup completed tasks after 5 minutes to prevent memory leak
      this.scheduleTaskCleanup(task.id);

    } catch (error) {
      task.status = 'failed';
      task.error = error instanceof Error ? error.message : String(error);
      this.metrics.tasksFailed++;
      this.emit('task:error', task, error);

      // v9.2.0: Also cleanup failed tasks
      this.scheduleTaskCleanup(task.id);
    }

    return task;
  }

  /**
   * v9.2.0: Schedule task cleanup after delay to prevent memory leak
   * Tasks are removed from the map after 5 minutes
   */
  private scheduleTaskCleanup(taskId: string, delayMs: number = 300000): void {
    setTimeout(() => {
      const task = this.tasks.get(taskId);
      if (task && task.status !== 'running') {
        this.tasks.delete(taskId);
      }
    }, delayMs);
  }

  /**
   * v9.2.0: Manual cleanup of old tasks (call periodically for long-running systems)
   */
  cleanupOldTasks(maxAgeMs: number = 3600000): number {
    const now = Date.now();
    let removed = 0;

    for (const [id, task] of this.tasks.entries()) {
      if (task.status !== 'running' && now - task.createdAt.getTime() > maxAgeMs) {
        this.tasks.delete(id);
        removed++;
      }
    }

    return removed;
  }

  /**
   * Find the best agent for a task based on capabilities
   */
  findBestAgent(task: string): AgentType | null {
    const taskLower = task.toLowerCase();
    let bestMatch: { agent: AgentType; score: number } | null = null;

    for (const [agent, caps] of Object.entries(AGENT_CAPABILITIES)) {
      const score = caps.skills.reduce((sum, skill) => {
        return sum + (taskLower.includes(skill) ? 1 : 0);
      }, 0);

      if (score > 0 && (!bestMatch || score > bestMatch.score)) {
        bestMatch = { agent: agent as AgentType, score };
      }
    }

    return bestMatch?.agent || null;
  }

  /**
   * Route a query to appropriate agents
   */
  async route(query: string, options?: {
    maxAgents?: number;
    priority?: MessagePriority;
  }): Promise<AgentType[]> {
    const queryLower = query.toLowerCase();
    const scored: Array<{ agent: AgentType; score: number }> = [];

    for (const [agent, caps] of Object.entries(AGENT_CAPABILITIES)) {
      const score = caps.skills.reduce((sum, skill) => {
        return sum + (queryLower.includes(skill) ? 2 : 0);
      }, 0);

      if (score > 0) {
        scored.push({ agent: agent as AgentType, score });
      }
    }

    // Sort by score descending, then by priority ascending
    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return AGENT_CAPABILITIES[a.agent].priority - AGENT_CAPABILITIES[b.agent].priority;
    });

    const maxAgents = options?.maxAgents || 3;
    return scored.slice(0, maxAgents).map(s => s.agent);
  }

  // ============================================================================
  // Execution Patterns
  // ============================================================================

  /**
   * Sequential execution: A → B → C
   * Each agent's output becomes the next agent's input
   */
  private async executeSequential(task: CoordinationTask): Promise<void> {
    let currentInput = task.query;

    for (const agentType of task.agents) {
      const startTime = Date.now();
      const response = await this.queryAgent(agentType, currentInput, task);

      task.results.push({
        agentId: `${agentType}-coordinator`,
        agentType,
        response,
        confidence: this.extractConfidence(response),
        latency: Date.now() - startTime,
        timestamp: new Date(),
      });

      // Transform output for next agent
      currentInput = JSON.stringify(response);
    }
  }

  /**
   * Parallel execution: A → [B, C, D] → gather
   * All agents process simultaneously
   */
  private async executeParallel(task: CoordinationTask): Promise<void> {
    const promises = task.agents.map(async (agentType) => {
      const startTime = Date.now();
      const response = await this.queryAgent(agentType, task.query, task);

      return {
        agentId: `${agentType}-coordinator`,
        agentType,
        response,
        confidence: this.extractConfidence(response),
        latency: Date.now() - startTime,
        timestamp: new Date(),
      } as AgentResponse;
    });

    const results = await Promise.allSettled(promises);

    for (const result of results) {
      if (result.status === 'fulfilled') {
        task.results.push(result.value);
      }
    }
  }

  /**
   * Debate pattern: Agents argue positions until convergence
   */
  private async executeDebate(task: CoordinationTask, config?: DebateConfig): Promise<void> {
    const debateConfig: DebateConfig = {
      maxRounds: 3,
      convergenceThreshold: 0.8,
      allowAbstain: true,
      requireUnanimity: false,
      ...config,
    };

    this.metrics.debatesHeld++;
    const positions: Map<AgentType, unknown> = new Map();
    let round = 0;
    let converged = false;

    while (round < debateConfig.maxRounds && !converged) {
      round++;

      // Each agent presents/updates their position
      for (const agentType of task.agents) {
        const previousPositions = Array.from(positions.entries())
          .filter(([a]) => a !== agentType)
          .map(([a, p]) => ({ agent: a, position: p }));

        const prompt = round === 1
          ? `${task.query}\n\nProvide your initial position.`
          : `${task.query}\n\nRound ${round}. Other positions:\n${JSON.stringify(previousPositions, null, 2)}\n\nUpdate your position considering the debate.`;

        const startTime = Date.now();
        const response = await this.queryAgent(agentType, prompt, task);
        positions.set(agentType, response);

        task.results.push({
          agentId: `${agentType}-debate-r${round}`,
          agentType,
          response,
          confidence: this.extractConfidence(response),
          latency: Date.now() - startTime,
          timestamp: new Date(),
        });
      }

      // Check for convergence
      converged = this.checkConvergence(Array.from(positions.values()), debateConfig.convergenceThreshold);
    }

    // Add convergence metadata
    task.context = {
      ...task.context,
      debate: {
        rounds: round,
        converged,
        positions: Object.fromEntries(positions),
      },
    };
  }

  /**
   * Voting pattern: Democratic decision-making
   */
  private async executeVoting(task: CoordinationTask): Promise<void> {
    this.metrics.votesHeld++;
    const votes: Map<string, AgentId[]> = new Map();

    // Each agent votes
    for (const agentType of task.agents) {
      const prompt = `${task.query}\n\nVote for one option. Respond with JSON: { "vote": "your_choice", "reason": "why" }`;

      const startTime = Date.now();
      const response = await this.queryAgent(agentType, prompt, task);

      task.results.push({
        agentId: `${agentType}-voter`,
        agentType,
        response,
        confidence: 1.0, // Votes are absolute
        latency: Date.now() - startTime,
        timestamp: new Date(),
      });

      // Extract vote
      const vote = this.extractVote(response);
      if (vote) {
        const voters = votes.get(vote) || [];
        voters.push(`${agentType}-voter`);
        votes.set(vote, voters);
      }
    }

    // Tally results
    const voteResults: VoteResult[] = [];
    const totalVotes = task.agents.length;

    for (const [option, voters] of votes) {
      voteResults.push({
        option,
        votes: voters.length,
        voters,
        percentage: (voters.length / totalVotes) * 100,
      });
    }

    voteResults.sort((a, b) => b.votes - a.votes);

    task.context = {
      ...task.context,
      voting: {
        results: voteResults,
        winner: voteResults[0]?.option,
        unanimous: voteResults.length === 1,
      },
    };
  }

  /**
   * Consensus pattern: Must reach agreement
   */
  private async executeConsensus(task: CoordinationTask): Promise<void> {
    // Similar to debate but requires unanimous agreement
    await this.executeDebate(task, {
      maxRounds: 5,
      convergenceThreshold: 0.95,
      requireUnanimity: true,
      allowAbstain: false,
    });
  }

  /**
   * Hierarchical pattern: Supervisor delegates to workers
   */
  private async executeHierarchical(task: CoordinationTask): Promise<void> {
    if (task.agents.length < 2) {
      return this.executeParallel(task);
    }

    // First agent is supervisor, rest are workers
    const [supervisor, ...workers] = task.agents;

    // Supervisor decomposes task
    const decompositionPrompt = `You are a supervisor. Decompose this task into subtasks for ${workers.length} workers (${workers.join(', ')}):\n\n${task.query}\n\nRespond with JSON array of subtasks: [{ "worker": "agent_type", "subtask": "description" }]`;

    const startTime = Date.now();
    const decomposition = await this.queryAgent(supervisor, decompositionPrompt, task);

    task.results.push({
      agentId: `${supervisor}-supervisor`,
      agentType: supervisor,
      response: decomposition,
      confidence: this.extractConfidence(decomposition),
      latency: Date.now() - startTime,
      timestamp: new Date(),
    });

    // Execute subtasks
    const subtasks = this.parseSubtasks(decomposition, workers);
    const workerPromises = subtasks.map(async ({ worker, subtask }) => {
      const workerStart = Date.now();
      const response = await this.queryAgent(worker, subtask, task);

      return {
        agentId: `${worker}-worker`,
        agentType: worker,
        response,
        confidence: this.extractConfidence(response),
        latency: Date.now() - workerStart,
        timestamp: new Date(),
      } as AgentResponse;
    });

    const workerResults = await Promise.allSettled(workerPromises);
    for (const result of workerResults) {
      if (result.status === 'fulfilled') {
        task.results.push(result.value);
      }
    }

    // Supervisor synthesizes results
    const workerOutputs = task.results
      .filter(r => r.agentId.includes('-worker'))
      .map(r => ({ agent: r.agentType, result: r.response }));

    const synthesisPrompt = `Synthesize these worker results into a final answer:\n\n${JSON.stringify(workerOutputs, null, 2)}`;

    const synthesisStart = Date.now();
    const synthesis = await this.queryAgent(supervisor, synthesisPrompt, task);

    task.results.push({
      agentId: `${supervisor}-synthesizer`,
      agentType: supervisor,
      response: synthesis,
      confidence: this.extractConfidence(synthesis),
      latency: Date.now() - synthesisStart,
      timestamp: new Date(),
    });
  }

  /**
   * Round-robin pattern: Rotate through agents
   */
  private async executeRoundRobin(task: CoordinationTask): Promise<void> {
    let agentIndex = 0;
    let currentInput = task.query;
    const maxIterations = task.agents.length * 2; // Each agent gets 2 turns

    for (let i = 0; i < maxIterations; i++) {
      const agentType = task.agents[agentIndex];
      const startTime = Date.now();

      const prompt = `Round ${Math.floor(i / task.agents.length) + 1}, Turn ${(i % task.agents.length) + 1}:\n\n${currentInput}`;
      const response = await this.queryAgent(agentType, prompt, task);

      task.results.push({
        agentId: `${agentType}-round${Math.floor(i / task.agents.length)}-turn${i % task.agents.length}`,
        agentType,
        response,
        confidence: this.extractConfidence(response),
        latency: Date.now() - startTime,
        timestamp: new Date(),
      });

      currentInput = JSON.stringify(response);
      agentIndex = (agentIndex + 1) % task.agents.length;
    }
  }

  // ============================================================================
  // Workflow Execution
  // ============================================================================

  /**
   * Register a workflow
   */
  registerWorkflow(workflow: Workflow): void {
    this.workflows.set(workflow.id, workflow);
  }

  /**
   * Execute a registered workflow
   */
  async executeWorkflow(
    workflowId: string,
    input: unknown,
    metadata?: Record<string, unknown>
  ): Promise<WorkflowContext> {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) {
      throw new Error(`Workflow not found: ${workflowId}`);
    }

    const context: WorkflowContext = {
      workflowId,
      currentStep: 0,
      results: new Map(),
      metadata: metadata || {},
      startTime: new Date(),
      errors: [],
    };

    context.results.set('input', input);
    this.metrics.workflowsRun++;
    this.emit('workflow:start', workflow, context);

    for (let i = 0; i < workflow.steps.length; i++) {
      const step = workflow.steps[i];
      context.currentStep = i;

      // Check condition
      if (step.condition && !step.condition(context)) {
        continue;
      }

      try {
        // Transform input if needed
        const previousResult = i === 0 ? input : context.results.get(workflow.steps[i - 1].id);
        const stepInput = step.transform ? step.transform(previousResult, context) : previousResult;

        // Execute step
        const task = await this.coordinate({
          query: typeof stepInput === 'string' ? stepInput : JSON.stringify(stepInput),
          agents: step.agents,
          pattern: step.pattern,
          aggregation: step.aggregation,
          timeout: step.timeout,
        });

        context.results.set(step.id, task.finalResult);
        this.emit('workflow:step', workflow, step, context);

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        context.errors.push(`Step ${step.id}: ${errorMessage}`);

        if (workflow.onError === 'stop') {
          throw error;
        }
        // 'skip' continues to next step
      }
    }

    this.emit('workflow:complete', workflow, context);
    return context;
  }

  // ============================================================================
  // Built-in Workflows
  // ============================================================================

  private registerBuiltinWorkflows(): void {
    // Research & Validate workflow
    this.registerWorkflow({
      id: 'research-validate',
      name: 'Research and Validate',
      description: 'Explorer researches, Critic validates, Ethicist approves',
      steps: [
        {
          id: 'research',
          name: 'Research',
          agents: ['explorer'],
          pattern: 'sequential',
          aggregation: 'first',
          messageType: 'QUERY',
        },
        {
          id: 'validate',
          name: 'Validate',
          agents: ['critic'],
          pattern: 'sequential',
          aggregation: 'first',
          messageType: 'QUERY',
          transform: (input) => `Critique this research:\n${JSON.stringify(input)}`,
        },
        {
          id: 'ethics-check',
          name: 'Ethics Check',
          agents: ['ethicist'],
          pattern: 'sequential',
          aggregation: 'first',
          messageType: 'ETHICAL_CHECK',
          transform: (input) => `Check ethics of this:\n${JSON.stringify(input)}`,
        },
      ],
      onError: 'stop',
    });

    // Build & Review workflow
    this.registerWorkflow({
      id: 'build-review',
      name: 'Build and Review',
      description: 'Builder creates, Critic reviews, iterate',
      steps: [
        {
          id: 'plan',
          name: 'Plan',
          agents: ['planner'],
          pattern: 'sequential',
          aggregation: 'first',
          messageType: 'QUERY',
        },
        {
          id: 'build',
          name: 'Build',
          agents: ['builder'],
          pattern: 'sequential',
          aggregation: 'first',
          messageType: 'BUILD_REQUEST',
          transform: (input) => `Build according to plan:\n${JSON.stringify(input)}`,
        },
        {
          id: 'review',
          name: 'Review',
          agents: ['critic', 'ethicist'],
          pattern: 'parallel',
          aggregation: 'all',
          messageType: 'QUERY',
          transform: (input) => `Review this build:\n${JSON.stringify(input)}`,
        },
      ],
      onError: 'skip',
    });

    // Predict & Decide workflow
    this.registerWorkflow({
      id: 'predict-decide',
      name: 'Predict and Decide',
      description: 'Predictor forecasts, Feeling evaluates, decide',
      steps: [
        {
          id: 'predict',
          name: 'Predict Outcomes',
          agents: ['predictor'],
          pattern: 'sequential',
          aggregation: 'first',
          messageType: 'PREDICT',
        },
        {
          id: 'evaluate',
          name: 'Evaluate Importance',
          agents: ['feeling'],
          pattern: 'sequential',
          aggregation: 'first',
          messageType: 'QUERY',
          transform: (input) => `Evaluate the importance of:\n${JSON.stringify(input)}`,
        },
        {
          id: 'decide',
          name: 'Make Decision',
          agents: ['ethicist', 'planner'],
          pattern: 'debate',
          aggregation: 'weighted',
          messageType: 'QUERY',
          transform: (input) => `Based on predictions and feelings, decide:\n${JSON.stringify(input)}`,
        },
      ],
      onError: 'stop',
    });

    // Full deliberation workflow
    this.registerWorkflow({
      id: 'full-deliberation',
      name: 'Full Deliberation',
      description: 'All agents deliberate on complex decisions',
      steps: [
        {
          id: 'gather-info',
          name: 'Gather Information',
          agents: ['explorer', 'memory', 'sensor'],
          pattern: 'parallel',
          aggregation: 'merge',
          messageType: 'QUERY',
        },
        {
          id: 'analyze',
          name: 'Analyze',
          agents: ['predictor', 'critic'],
          pattern: 'parallel',
          aggregation: 'all',
          messageType: 'QUERY',
          transform: (input) => `Analyze this information:\n${JSON.stringify(input)}`,
        },
        {
          id: 'deliberate',
          name: 'Deliberate',
          agents: ['feeling', 'ethicist', 'planner'],
          pattern: 'consensus',
          aggregation: 'majority',
          messageType: 'QUERY',
          transform: (input) => `Deliberate on the best course of action:\n${JSON.stringify(input)}`,
        },
        {
          id: 'narrate',
          name: 'Narrate Decision',
          agents: ['narrator'],
          pattern: 'sequential',
          aggregation: 'first',
          messageType: 'NARRATE',
          transform: (input) => `Explain this decision process:\n${JSON.stringify(input)}`,
        },
      ],
      onError: 'skip',
    });
  }

  // ============================================================================
  // Agent Communication
  // ============================================================================

  /**
   * Query an agent and wait for response
   * v14.2: Uses AgentPool for efficient agent reuse (95% cost reduction)
   */
  private async queryAgent(
    agentType: AgentType,
    query: string,
    task: CoordinationTask
  ): Promise<unknown> {
    this.metrics.poolAcquires++;

    try {
      // Use pool.execute with TaskRequest for automatic acquire/release
      const taskRequest = {
        id: task.id,
        input: query,
        preferredAgentType: agentType,
        priority: task.priority,
        timeout: task.timeout,
      };

      const result = await this.pool.execute(taskRequest);
      this.metrics.poolReleases++;

      return result.success ? result.output : { error: result.error, fallback: true };

    } catch (error) {
      this.metrics.poolReleases++;
      // Fallback to bus-based messaging if pool fails
      return this.queryAgentViaBus(agentType, query, task);
    }
  }

  /**
   * Fallback: Query agent via message bus (legacy method)
   */
  private async queryAgentViaBus(
    agentType: AgentType,
    query: string,
    task: CoordinationTask
  ): Promise<unknown> {
    const messageType = this.getMessageTypeForAgent(agentType);

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Agent ${agentType} timeout`));
      }, task.timeout);

      // Set up response listener BEFORE sending to avoid race condition
      const responsePromise = this.bus.waitForMessage(
        { correlationId: task.id, from: agentType, to: 'coordinator' },
        task.timeout
      );

      // Send query
      this.bus.send(
        'coordinator',
        agentType,
        messageType,
        { query, context: task.context },
        { priority: task.priority, correlationId: task.id }
      ).catch(error => {
        clearTimeout(timeoutId);
        resolve({ error: error.message, fallback: true });
      });

      // Wait for response
      responsePromise.then(response => {
        clearTimeout(timeoutId);
        resolve(response.payload);
      }).catch(error => {
        clearTimeout(timeoutId);
        // Return a default response instead of failing
        resolve({ error: error.message, fallback: true });
      });
    });
  }

  /**
   * Get appropriate message type for agent
   */
  private getMessageTypeForAgent(agentType: AgentType): MessageType {
    const caps = AGENT_CAPABILITIES[agentType];
    return caps?.inputTypes[0] || 'QUERY';
  }

  // ============================================================================
  // Aggregation Strategies
  // ============================================================================

  private aggregate(results: AgentResponse[], strategy: AggregationStrategy): unknown {
    if (results.length === 0) return null;

    switch (strategy) {
      case 'first':
        return results[0].response;

      case 'all':
        return results.map(r => ({
          agent: r.agentType,
          response: r.response,
          confidence: r.confidence,
        }));

      case 'majority':
        return this.aggregateMajority(results);

      case 'weighted':
        return this.aggregateWeighted(results);

      case 'best':
        const best = results.reduce((a, b) => a.confidence > b.confidence ? a : b);
        return best.response;

      case 'merge':
        return this.aggregateMerge(results);

      default:
        return results.map(r => r.response);
    }
  }

  private aggregateMajority(results: AgentResponse[]): unknown {
    const votes = new Map<string, number>();

    for (const result of results) {
      const key = JSON.stringify(result.response);
      votes.set(key, (votes.get(key) || 0) + 1);
    }

    let maxVotes = 0;
    let winner: unknown = null;

    for (const [response, count] of votes) {
      if (count > maxVotes) {
        maxVotes = count;
        winner = JSON.parse(response);
      }
    }

    return winner;
  }

  private aggregateWeighted(results: AgentResponse[]): unknown {
    // For numeric results, weighted average
    const numericResults = results.filter(r => typeof r.response === 'number');
    if (numericResults.length === results.length) {
      const totalWeight = results.reduce((sum, r) => sum + r.confidence, 0);
      const weightedSum = results.reduce((sum, r) =>
        sum + (r.response as number) * r.confidence, 0);
      return weightedSum / totalWeight;
    }

    // For non-numeric, return highest confidence response
    const best = results.reduce((a, b) => a.confidence > b.confidence ? a : b);
    return best.response;
  }

  private aggregateMerge(results: AgentResponse[]): unknown {
    // Merge all responses into a combined object
    const merged: Record<string, unknown> = {};

    for (const result of results) {
      merged[result.agentType] = result.response;
    }

    return merged;
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  private extractConfidence(response: unknown): number {
    if (typeof response === 'object' && response !== null) {
      const obj = response as Record<string, unknown>;
      if (typeof obj.confidence === 'number') return obj.confidence;
      if (typeof obj.score === 'number') return obj.score;
    }
    return 0.5; // Default confidence
  }

  private extractVote(response: unknown): string | null {
    if (typeof response === 'object' && response !== null) {
      const obj = response as Record<string, unknown>;
      if (typeof obj.vote === 'string') return obj.vote;
    }
    if (typeof response === 'string') {
      try {
        const parsed = JSON.parse(response);
        return parsed.vote || null;
      } catch {
        return response;
      }
    }
    return null;
  }

  private checkConvergence(positions: unknown[], threshold: number): boolean {
    if (positions.length < 2) return true;

    // Simple convergence: check if all positions are similar
    const serialized = positions.map(p => JSON.stringify(p));
    const unique = new Set(serialized);

    return unique.size / positions.length <= (1 - threshold);
  }

  private parseSubtasks(
    decomposition: unknown,
    workers: AgentType[]
  ): Array<{ worker: AgentType; subtask: string }> {
    try {
      if (Array.isArray(decomposition)) {
        return decomposition.map((d, i) => ({
          worker: d.worker || workers[i % workers.length],
          subtask: d.subtask || d.task || JSON.stringify(d),
        }));
      }

      if (typeof decomposition === 'object' && decomposition !== null) {
        const obj = decomposition as Record<string, unknown>;
        if (Array.isArray(obj.subtasks)) {
          return this.parseSubtasks(obj.subtasks, workers);
        }
      }
    } catch {
      // Fall through to default
    }

    // Default: distribute original task to all workers
    return workers.map(worker => ({
      worker,
      subtask: JSON.stringify(decomposition),
    }));
  }

  // ============================================================================
  // Metrics & Info
  // ============================================================================

  getMetrics() {
    const totalLatency = this.metrics.tasksCompleted > 0
      ? this.metrics.totalLatency / this.metrics.tasksCompleted
      : 0;

    // Get pool stats for comprehensive metrics
    const poolStats = this.pool.getStats();

    return {
      ...this.metrics,
      averageLatency: totalLatency,
      successRate: this.metrics.tasksCreated > 0
        ? this.metrics.tasksCompleted / this.metrics.tasksCreated
        : 0,
      registeredWorkflows: this.workflows.size,
      activeTasks: Array.from(this.tasks.values()).filter(t => t.status === 'running').length,
      // v14.2: Pool efficiency metrics
      poolEfficiency: {
        acquires: this.metrics.poolAcquires,
        releases: this.metrics.poolReleases,
        poolSize: poolStats.poolSize,
        agentsSpawned: poolStats.agentsSpawned,
        agentsRecycled: poolStats.agentsRecycled,
        totalPoolCost: poolStats.totalCost,
        avgPoolLatency: poolStats.avgLatency,
      },
    };
  }

  getTask(taskId: string): CoordinationTask | undefined {
    return this.tasks.get(taskId);
  }

  getWorkflows(): Workflow[] {
    return Array.from(this.workflows.values());
  }

  getAgentCapabilities(): typeof AGENT_CAPABILITIES {
    return AGENT_CAPABILITIES;
  }

  // ============================================================================
  // Cleanup
  // ============================================================================

  clear(): void {
    this.tasks.clear();
    if (this.subscriptionId) {
      this.bus.unsubscribe(this.subscriptionId);
      this.subscriptionId = null;
    }
  }
}

// ============================================================================
// Singleton & Factory
// ============================================================================

let coordinatorInstance: AgentCoordinator | null = null;

export function getCoordinator(bus?: MessageBus): AgentCoordinator {
  if (!coordinatorInstance) {
    coordinatorInstance = new AgentCoordinator(bus);
  }
  return coordinatorInstance;
}

export function createCoordinator(bus?: MessageBus): AgentCoordinator {
  return new AgentCoordinator(bus);
}

export function resetCoordinator(): void {
  if (coordinatorInstance) {
    coordinatorInstance.clear();
    coordinatorInstance = null;
  }
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Quick multi-agent coordination
 */
export async function coordinateAgents(
  query: string,
  agents: AgentType[],
  pattern: CoordinationPattern = 'parallel'
): Promise<unknown> {
  const coordinator = getCoordinator();
  const task = await coordinator.coordinate({ query, agents, pattern });
  return task.finalResult;
}

/**
 * Find best agent for a task
 */
export function routeToAgent(task: string): AgentType | null {
  const coordinator = getCoordinator();
  return coordinator.findBestAgent(task);
}

/**
 * Run a built-in workflow
 */
export async function runWorkflow(
  workflowId: string,
  input: unknown
): Promise<WorkflowContext> {
  const coordinator = getCoordinator();
  return coordinator.executeWorkflow(workflowId, input);
}
