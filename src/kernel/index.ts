/**
 * Genesis 4.0 - Strong Kernel
 *
 * The orchestrator - it doesn't think, but it manages who thinks.
 *
 * Based on:
 * - LangGraph Supervisor Pattern (conditional routing)
 * - AWS Agent Squad (classifier-based routing)
 * - GENESIS-4.0.md specification
 *
 * Components:
 * - State Machine: Track system state
 * - Agent Registry: Spawn, kill, monitor agents
 * - Health Monitor: Check agent health
 * - Invariant Checker: Ensure core invariants
 * - Energy Manager: Track energy, trigger dormancy
 * - Task Orchestrator: Route tasks to appropriate agents
 */

import { randomUUID } from 'crypto';
import {
  messageBus,
  MessageBus,
  createAgentEcosystem,
  AgentRegistry,
  BaseAgent,
  AgentType,
  Message,
  MessageType,
  AgentId,
} from '../agents/index.js';

// ============================================================================
// Kernel Types
// ============================================================================

export type KernelState =
  | 'idle'           // Waiting for input
  | 'sensing'        // Gathering sensory data
  | 'thinking'       // Agents deliberating
  | 'deciding'       // Ethical check + planning
  | 'acting'         // Executing action
  | 'reflecting'     // Updating memory
  | 'dormant'        // Low energy, minimal activity
  | 'self_improving' // Modifying own code
  | 'error';         // Recovery mode

export interface KernelConfig {
  energy: number;           // 0.0 - 1.0
  dormancyThreshold: number; // Enter dormant below this
  healthCheckInterval: number; // ms
  maxTaskTimeout: number;    // ms
  enableSelfImprovement: boolean;
}

export interface Task {
  id: string;
  type: 'query' | 'build' | 'research' | 'pipeline';
  goal: string;
  context?: Record<string, any>;
  priority: 'critical' | 'high' | 'normal' | 'low';
  requester: string;
  createdAt: Date;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  result?: any;
  error?: string;
}

export interface TaskPlan {
  id: string;
  taskId: string;
  steps: TaskStep[];
  currentStep: number;
  status: 'planning' | 'executing' | 'completed' | 'failed';
}

export interface TaskStep {
  id: string;
  agent: AgentType;
  action: string;
  input: any;
  output?: any;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  dependsOn?: string[]; // Step IDs
}

// Valid state transitions (from GENESIS-4.0.md)
const STATE_TRANSITIONS: Record<KernelState, KernelState[]> = {
  idle: ['sensing', 'self_improving', 'dormant'],
  sensing: ['thinking', 'error', 'idle'],
  thinking: ['deciding', 'sensing', 'error', 'idle'],
  deciding: ['acting', 'thinking', 'idle'], // Can defer to human (→idle)
  acting: ['reflecting', 'error'],
  reflecting: ['idle', 'thinking'],
  dormant: ['idle'], // Only on energy restore
  self_improving: ['idle', 'error'],
  error: ['idle'], // Reset
};

// Invariant Registry (extensible system for Phase 5.1+)
import {
  InvariantRegistry,
  invariantRegistry,
  InvariantContext,
  InvariantResult,
} from './invariants.js';

// ============================================================================
// Kernel Class
// ============================================================================

export class Kernel {
  private id: string;
  private state: KernelState = 'idle';
  private config: KernelConfig;
  private registry: AgentRegistry;
  private agents: Map<AgentType, BaseAgent>;
  private bus: MessageBus;

  // Task management
  private taskQueue: Task[] = [];
  private activeTasks: Map<string, Task> = new Map();
  private taskPlans: Map<string, TaskPlan> = new Map();
  private taskHistory: Task[] = [];

  // Health monitoring
  private healthCheckTimer?: NodeJS.Timeout;
  private agentHealth: Map<AgentId, { healthy: boolean; lastCheck: Date }> = new Map();

  // Invariant checking (extensible registry)
  private invariants: InvariantRegistry;

  // Metrics
  private metrics = {
    startTime: new Date(),
    stateTransitions: 0,
    tasksCompleted: 0,
    tasksFailed: 0,
    invariantViolations: 0,
    energyLowEvents: 0,
  };

  // Event handlers
  private stateListeners: ((state: KernelState, prev: KernelState) => void)[] = [];

  constructor(config: Partial<KernelConfig> = {}) {
    this.id = `kernel-${randomUUID().slice(0, 8)}`;
    this.config = {
      energy: 1.0,
      dormancyThreshold: 0.1,
      healthCheckInterval: 60000, // 1 minute
      maxTaskTimeout: 300000,     // 5 minutes
      enableSelfImprovement: false,
      ...config,
    };
    this.bus = messageBus;

    // Initialize invariant registry (uses singleton but allows extension)
    this.invariants = invariantRegistry;

    // Create agent ecosystem
    const ecosystem = createAgentEcosystem(this.bus);
    this.registry = ecosystem.registry;
    this.agents = ecosystem.agents;

    this.log('Kernel initialized');
  }

  // ============================================================================
  // Lifecycle
  // ============================================================================

  async start(): Promise<void> {
    this.log('Starting kernel...');

    // Wake all agents
    for (const agent of this.agents.values()) {
      agent.wake();
    }

    // Subscribe to kernel messages
    this.bus.subscribe(
      'kernel',
      async (message) => await this.handleMessage(message)
    );

    // Start health monitoring
    this.startHealthMonitoring();

    // Check initial invariants
    await this.checkInvariants();

    this.log('Kernel started');
    this.log(`State: ${this.state}`);
    this.log(`Agents: ${this.agents.size}`);
  }

  async stop(): Promise<void> {
    this.log('Stopping kernel...');

    // Stop health monitoring
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
    }

    // Cancel all active tasks
    for (const task of this.activeTasks.values()) {
      task.status = 'cancelled';
    }

    // Shutdown all agents
    this.registry.shutdownAll();

    this.transition('idle');
    this.log('Kernel stopped');
  }

  // ============================================================================
  // State Machine
  // ============================================================================

  private transition(to: KernelState): boolean {
    const from = this.state;

    // Check if transition is valid
    if (!STATE_TRANSITIONS[from].includes(to)) {
      this.log(`Invalid transition: ${from} -> ${to}`);
      return false;
    }

    // Energy check - can only exit dormant if energy restored
    if (from === 'dormant' && to === 'idle' && this.config.energy < this.config.dormancyThreshold) {
      this.log('Cannot exit dormant: energy too low');
      return false;
    }

    // Perform transition
    this.state = to;
    this.metrics.stateTransitions++;

    this.log(`Transition: ${from} -> ${to}`);

    // Notify listeners
    for (const listener of this.stateListeners) {
      listener(to, from);
    }

    // Handle special states
    if (to === 'dormant') {
      this.enterDormancy();
    } else if (from === 'dormant') {
      this.exitDormancy();
    }

    return true;
  }

  private enterDormancy(): void {
    this.log('Entering dormant state...');
    this.metrics.energyLowEvents++;

    // Put non-essential agents to sleep
    for (const [type, agent] of this.agents) {
      if (!['memory', 'sensor'].includes(type)) {
        agent.sleep();
      }
    }

    // Broadcast dormancy alert
    this.bus.broadcast('kernel', 'ALERT', {
      type: 'dormancy',
      message: 'System entering dormant state due to low energy',
      energy: this.config.energy,
    });
  }

  private exitDormancy(): void {
    this.log('Exiting dormant state...');

    // Wake all agents
    for (const agent of this.agents.values()) {
      agent.wake();
    }

    // Broadcast wake alert
    this.bus.broadcast('kernel', 'ALERT', {
      type: 'wake',
      message: 'System exiting dormant state',
      energy: this.config.energy,
    });
  }

  onStateChange(listener: (state: KernelState, prev: KernelState) => void): void {
    this.stateListeners.push(listener);
  }

  // ============================================================================
  // Task Orchestration (Supervisor Pattern)
  // ============================================================================

  async submit(task: Omit<Task, 'id' | 'createdAt' | 'status'>): Promise<string> {
    const fullTask: Task = {
      ...task,
      id: randomUUID(),
      createdAt: new Date(),
      status: 'pending',
    };

    this.taskQueue.push(fullTask);
    this.log(`Task submitted: ${fullTask.id} (${fullTask.type}: ${fullTask.goal})`);

    // Process queue if idle
    if (this.state === 'idle') {
      await this.processTaskQueue();
    }

    return fullTask.id;
  }

  private async processTaskQueue(): Promise<void> {
    while (this.taskQueue.length > 0 && this.state !== 'dormant') {
      const task = this.dequeueTask();
      if (!task) break;

      await this.executeTask(task);
    }
  }

  private dequeueTask(): Task | null {
    // Sort by priority
    this.taskQueue.sort((a, b) => {
      const priorityOrder = { critical: 0, high: 1, normal: 2, low: 3 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });

    return this.taskQueue.shift() || null;
  }

  private async executeTask(task: Task): Promise<void> {
    this.log(`Executing task: ${task.id}`);
    task.status = 'running';
    this.activeTasks.set(task.id, task);

    try {
      // Phase 1: Sensing
      this.transition('sensing');
      const sensorData = await this.gatherSensorData(task);

      // Phase 2: Thinking (plan the task)
      this.transition('thinking');
      const plan = await this.planTask(task, sensorData);
      this.taskPlans.set(task.id, plan);

      // Phase 3: Deciding (ethical check)
      this.transition('deciding');
      const ethicalDecision = await this.ethicalCheck(task, plan);

      if (ethicalDecision.allow === false) {
        task.status = 'failed';
        task.error = `Blocked by ethics: ${ethicalDecision.reason}`;
        this.log(`Task ${task.id} blocked: ${ethicalDecision.reason}`);
        this.transition('idle');
        return;
      }

      if (ethicalDecision.allow === 'defer') {
        task.status = 'pending';
        task.error = `Deferred to human: ${ethicalDecision.reason}`;
        this.log(`Task ${task.id} deferred: ${ethicalDecision.reason}`);
        this.transition('idle');
        return;
      }

      // Phase 4: Acting (execute the plan)
      this.transition('acting');
      const result = await this.executePlan(task, plan);

      // Phase 5: Reflecting (store results)
      this.transition('reflecting');
      await this.reflect(task, result);

      // Complete
      task.status = 'completed';
      task.result = result;
      this.metrics.tasksCompleted++;
      this.log(`Task ${task.id} completed`);

    } catch (error) {
      task.status = 'failed';
      task.error = error instanceof Error ? error.message : String(error);
      this.metrics.tasksFailed++;
      this.log(`Task ${task.id} failed: ${task.error}`);
      this.transition('error');

      // Attempt recovery
      await this.recoverFromError();

    } finally {
      this.activeTasks.delete(task.id);
      this.taskHistory.push(task);
      this.transition('idle');
    }
  }

  // ============================================================================
  // Task Phases
  // ============================================================================

  private async gatherSensorData(task: Task): Promise<any> {
    // Use Sensor agent to gather relevant data
    try {
      const response = await this.bus.request(
        'kernel',
        'sensor',
        'QUERY',
        { query: task.goal, context: task.context },
        10000
      );
      return response.payload;
    } catch {
      return { sensors: 'unavailable' };
    }
  }

  private async planTask(task: Task, sensorData: any): Promise<TaskPlan> {
    // Use Planner agent to create a plan
    try {
      const response = await this.bus.request(
        'kernel',
        'planner',
        'PLAN',
        {
          goal: task.goal,
          type: task.type,
          context: { ...task.context, sensorData },
          template: this.getTemplateForTaskType(task.type),
        },
        15000
      );

      const plannerResult = response.payload;

      // Convert planner steps to TaskSteps
      const steps: TaskStep[] = (plannerResult.steps || []).map((step: any, i: number) => ({
        id: `step-${i}`,
        agent: this.selectAgentForStep(step),
        action: step.action,
        input: step,
        status: 'pending' as const,
      }));

      return {
        id: randomUUID(),
        taskId: task.id,
        steps,
        currentStep: 0,
        status: 'planning',
      };
    } catch {
      // Fallback: simple single-step plan
      return {
        id: randomUUID(),
        taskId: task.id,
        steps: [{
          id: 'step-0',
          agent: this.selectAgentForTaskType(task.type),
          action: task.type,
          input: { goal: task.goal, context: task.context },
          status: 'pending',
        }],
        currentStep: 0,
        status: 'planning',
      };
    }
  }

  private getTemplateForTaskType(type: string): string {
    const templates: Record<string, string> = {
      query: 'research',
      build: 'build',
      research: 'research',
      pipeline: 'pipeline',
    };
    return templates[type] || 'research';
  }

  private selectAgentForTaskType(type: string): AgentType {
    const mapping: Record<string, AgentType> = {
      query: 'explorer',
      build: 'builder',
      research: 'explorer',
      pipeline: 'planner',
    };
    return mapping[type] || 'explorer';
  }

  private selectAgentForStep(step: any): AgentType {
    const action = (step.action || '').toLowerCase();

    if (action.includes('search') || action.includes('research') || action.includes('explore')) {
      return 'explorer';
    }
    if (action.includes('build') || action.includes('code') || action.includes('implement')) {
      return 'builder';
    }
    if (action.includes('critique') || action.includes('review') || action.includes('analyze')) {
      return 'critic';
    }
    if (action.includes('plan') || action.includes('decompose')) {
      return 'planner';
    }
    if (action.includes('predict') || action.includes('forecast')) {
      return 'predictor';
    }
    if (action.includes('remember') || action.includes('store') || action.includes('retrieve')) {
      return 'memory';
    }
    if (action.includes('feel') || action.includes('evaluate')) {
      return 'feeling';
    }
    if (action.includes('narrate') || action.includes('story')) {
      return 'narrator';
    }
    if (action.includes('sense') || action.includes('mcp')) {
      return 'sensor';
    }

    return 'explorer'; // Default
  }

  private async ethicalCheck(task: Task, plan: TaskPlan): Promise<any> {
    // Every external action must pass ethical check (INV-002)
    try {
      const response = await this.bus.request(
        'kernel',
        'ethicist',
        'ETHICAL_CHECK',
        {
          id: task.id,
          type: task.type,
          description: task.goal,
          parameters: task.context,
        },
        10000
      );
      return response.payload;
    } catch {
      // Conservative: defer if ethicist unavailable
      return { allow: 'defer', reason: 'Ethicist unavailable, deferring to human' };
    }
  }

  private async executePlan(task: Task, plan: TaskPlan): Promise<any> {
    plan.status = 'executing';
    const results: any[] = [];

    for (let i = 0; i < plan.steps.length; i++) {
      const step = plan.steps[i];
      plan.currentStep = i;

      // Check dependencies
      if (step.dependsOn) {
        const depsComplete = step.dependsOn.every(
          (depId) => plan.steps.find((s) => s.id === depId)?.status === 'completed'
        );
        if (!depsComplete) {
          step.status = 'skipped';
          continue;
        }
      }

      // Execute step
      step.status = 'running';
      this.log(`Executing step ${i + 1}/${plan.steps.length}: ${step.action} via ${step.agent}`);

      try {
        const response = await this.bus.request(
          'kernel',
          step.agent,
          this.getMessageTypeForAgent(step.agent),
          step.input,
          30000
        );

        step.output = response.payload;
        step.status = 'completed';
        results.push(step.output);

      } catch (error) {
        step.status = 'failed';
        step.output = { error: error instanceof Error ? error.message : String(error) };

        // Use Critic to evaluate failure
        const critique = await this.critiqueFailure(step, error);
        if (critique.shouldContinue) {
          results.push(null);
        } else {
          throw new Error(`Step ${step.id} failed: ${step.output.error}`);
        }
      }
    }

    plan.status = 'completed';
    return { steps: results, plan };
  }

  private getMessageTypeForAgent(agent: AgentType): MessageType {
    const mapping: Record<AgentType, MessageType> = {
      // Core agents (v4.0)
      explorer: 'QUERY',
      memory: 'MEMORY_STORE',
      planner: 'PLAN',
      predictor: 'PREDICT',
      feeling: 'FEELING',
      critic: 'CRITIQUE',
      ethicist: 'ETHICAL_CHECK',
      builder: 'BUILD',
      narrator: 'NARRATE',
      sensor: 'SENSE',
      // Phase 5.1+ agents
      economic: 'COST_TRACK',
      consciousness: 'PHI_CHECK',
      'world-model': 'WORLD_PREDICT',
      causal: 'INTERVENTION',
      // Phase 5.5+ agents
      swarm: 'SWARM_UPDATE',
      grounding: 'GROUND_CLAIM',
      anticipatory: 'WORLD_SIMULATE',
    };
    return mapping[agent] || 'QUERY';
  }

  private async critiqueFailure(step: TaskStep, error: unknown): Promise<{ shouldContinue: boolean }> {
    try {
      const response = await this.bus.request(
        'kernel',
        'critic',
        'CRITIQUE',
        {
          target: step.id,
          type: 'failure',
          content: { step, error: String(error) },
        },
        5000
      );
      return { shouldContinue: response.payload.score > 0.5 };
    } catch {
      return { shouldContinue: false };
    }
  }

  private async reflect(task: Task, result: any): Promise<void> {
    // Store in memory
    try {
      await this.bus.request(
        'kernel',
        'memory',
        'MEMORY_STORE',
        {
          key: `task:${task.id}`,
          value: {
            task: { id: task.id, type: task.type, goal: task.goal },
            result,
            completedAt: new Date(),
          },
          type: 'episodic',
          importance: task.priority === 'critical' ? 1.0 : 0.5,
        },
        5000
      );
    } catch {
      // Memory storage failed, log but continue
      this.log(`Warning: Failed to store task ${task.id} in memory`);
    }

    // Generate narrative
    try {
      await this.bus.request(
        'kernel',
        'narrator',
        'NARRATE',
        {
          events: [
            { type: 'TASK_COMPLETED', data: { id: task.id, goal: task.goal } },
          ],
        },
        5000
      );
    } catch {
      // Narrative generation failed, non-critical
    }
  }

  private async recoverFromError(): Promise<void> {
    this.log('Attempting error recovery...');

    // Check all agent health
    const healthResults = await this.checkAllAgentHealth();
    const unhealthyAgents = healthResults.filter((r) => !r.healthy);

    if (unhealthyAgents.length > 0) {
      this.log(`Unhealthy agents: ${unhealthyAgents.map((a) => a.id).join(', ')}`);

      // Restart unhealthy agents (INV-004: at least one must be responsive)
      for (const agent of unhealthyAgents) {
        const type = agent.id.split('-')[0] as AgentType;
        const existingAgent = this.agents.get(type);
        if (existingAgent) {
          existingAgent.sleep();
          existingAgent.wake();
          this.log(`Restarted agent: ${type}`);
        }
      }
    }

    // Check invariants
    await this.checkInvariants();

    this.transition('idle');
  }

  // ============================================================================
  // Health Monitoring
  // ============================================================================

  private startHealthMonitoring(): void {
    this.healthCheckTimer = setInterval(
      async () => await this.performHealthCheck(),
      this.config.healthCheckInterval
    );
  }

  private async performHealthCheck(): Promise<void> {
    const results = await this.checkAllAgentHealth();

    // Update health map
    for (const result of results) {
      this.agentHealth.set(result.id, {
        healthy: result.healthy,
        lastCheck: new Date(),
      });
    }

    // Check invariants
    await this.checkInvariants();

    // Check energy
    this.checkEnergy();
  }

  private async checkAllAgentHealth(): Promise<{ id: AgentId; healthy: boolean }[]> {
    const results: { id: AgentId; healthy: boolean }[] = [];

    for (const [type, agent] of this.agents) {
      try {
        const health = agent.health();
        // Derive healthy from state: idle, working, waiting are healthy; error, shutdown are not
        const isHealthy = ['idle', 'working', 'waiting'].includes(health.state);
        results.push({
          id: agent.id,
          healthy: isHealthy,
        });
      } catch {
        results.push({
          id: agent.id,
          healthy: false,
        });
      }
    }

    return results;
  }

  private checkEnergy(): void {
    if (this.config.energy < this.config.dormancyThreshold && this.state !== 'dormant') {
      this.log(`Energy critical: ${(this.config.energy * 100).toFixed(1)}%`);
      this.transition('dormant');
    }
  }

  // ============================================================================
  // Invariant Checking
  // ============================================================================

  private async checkInvariants(): Promise<boolean> {
    // Build context for invariant checkers
    const healthResults = await this.checkAllAgentHealth();
    const responsiveCount = healthResults.filter((r) => r.healthy).length;

    const context: InvariantContext = {
      // Energy state
      energy: this.config.energy,
      dormancyThreshold: this.config.dormancyThreshold,
      isDormant: this.state === 'dormant',

      // Agent state
      responsiveAgentCount: responsiveCount,
      totalAgentCount: this.agents.size,

      // Extended context (for Phase 5.1+ invariants)
      // These will be populated when the respective modules are implemented
      merkleValid: true,  // TODO: Check actual Merkle chain
      // phi: undefined,          // Phase 5.3
      // phiMin: undefined,       // Phase 5.3
      // budget: undefined,       // Phase 5.1
      // budgetLimit: undefined,  // Phase 5.1
      // worldModelValid: undefined, // Phase 5.2
    };

    // Check all invariants via registry
    const results = this.invariants.checkAll(context);
    const violations = this.invariants.getViolations(results);

    // Report violations
    if (violations.length > 0) {
      this.metrics.invariantViolations += violations.length;
      for (const v of violations) {
        this.log(`INVARIANT VIOLATION: ${v.id}: ${v.message || v.name}`);
      }

      // Broadcast alert with detailed results
      await this.bus.broadcast('kernel', 'ALERT', {
        type: 'invariant_violation',
        violations: violations.map(v => `${v.id}: ${v.message || v.name}`),
        results,
        timestamp: new Date(),
      });

      // Check if any critical violations
      const criticalViolations = this.invariants.getCriticalViolations(results);
      if (criticalViolations.length > 0) {
        this.log(`CRITICAL VIOLATIONS: ${criticalViolations.length}`);
      }

      return false;
    }

    return true;
  }

  /**
   * Get the invariant registry for extension
   */
  getInvariantRegistry(): InvariantRegistry {
    return this.invariants;
  }

  /**
   * Get invariant statistics
   */
  getInvariantStats() {
    return this.invariants.getStats();
  }

  // ============================================================================
  // Energy Management
  // ============================================================================

  setEnergy(energy: number): void {
    const prev = this.config.energy;
    this.config.energy = Math.max(0, Math.min(1, energy));

    if (prev > this.config.dormancyThreshold && this.config.energy <= this.config.dormancyThreshold) {
      this.transition('dormant');
    } else if (prev <= this.config.dormancyThreshold && this.config.energy > this.config.dormancyThreshold) {
      if (this.state === 'dormant') {
        this.transition('idle');
      }
    }
  }

  getEnergy(): number {
    return this.config.energy;
  }

  // ============================================================================
  // Message Handling
  // ============================================================================

  private async handleMessage(message: Message): Promise<void> {
    switch (message.type) {
      case 'COMMAND':
        await this.handleCommand(message);
        break;
      case 'QUERY':
        await this.handleQuery(message);
        break;
      case 'ALERT':
        await this.handleAlert(message);
        break;
    }
  }

  private async handleCommand(message: Message): Promise<void> {
    const { command, params } = message.payload;

    switch (command) {
      case 'submit_task':
        const taskId = await this.submit(params);
        await this.bus.send('kernel', message.from, 'RESPONSE', { taskId });
        break;

      case 'get_status':
        await this.bus.send('kernel', message.from, 'RESPONSE', this.getStatus());
        break;

      case 'set_energy':
        this.setEnergy(params.energy);
        await this.bus.send('kernel', message.from, 'RESPONSE', { energy: this.config.energy });
        break;

      case 'stop':
        await this.stop();
        await this.bus.send('kernel', message.from, 'RESPONSE', { stopped: true });
        break;
    }
  }

  private async handleQuery(message: Message): Promise<void> {
    const { query } = message.payload;

    if (query === 'status') {
      await this.bus.send('kernel', message.from, 'RESPONSE', this.getStatus());
    } else if (query === 'metrics') {
      await this.bus.send('kernel', message.from, 'RESPONSE', this.getMetrics());
    } else if (query === 'tasks') {
      await this.bus.send('kernel', message.from, 'RESPONSE', {
        queue: this.taskQueue.length,
        active: this.activeTasks.size,
        history: this.taskHistory.length,
      });
    }
  }

  private async handleAlert(message: Message): Promise<void> {
    const { type } = message.payload;

    if (type === 'ethical_decision' && message.payload.decision !== true) {
      this.log(`Ethical alert from ${message.from}: ${message.payload.reason}`);
    }
  }

  // ============================================================================
  // Public API
  // ============================================================================

  getState(): KernelState {
    return this.state;
  }

  getStatus() {
    return {
      id: this.id,
      state: this.state,
      energy: this.config.energy,
      agents: {
        total: this.agents.size,
        healthy: Array.from(this.agentHealth.values()).filter((h) => h.healthy).length,
      },
      tasks: {
        queue: this.taskQueue.length,
        active: this.activeTasks.size,
        completed: this.metrics.tasksCompleted,
        failed: this.metrics.tasksFailed,
      },
      uptime: Date.now() - this.metrics.startTime.getTime(),
    };
  }

  getMetrics() {
    return {
      ...this.metrics,
      uptime: Date.now() - this.metrics.startTime.getTime(),
      agentCount: this.agents.size,
      taskQueueLength: this.taskQueue.length,
      activeTaskCount: this.activeTasks.size,
    };
  }

  getAgents(): Map<AgentType, BaseAgent> {
    return this.agents;
  }

  getRegistry(): AgentRegistry {
    return this.registry;
  }

  // ============================================================================
  // Logging
  // ============================================================================

  private log(message: string): void {
    const timestamp = new Date().toISOString().slice(11, 23);
    console.log(`[${timestamp}] [Kernel] ${message}`);
  }
}

// ============================================================================
// Factory
// ============================================================================

export function createKernel(config?: Partial<KernelConfig>): Kernel {
  return new Kernel(config);
}

// ============================================================================
// Singleton (optional)
// ============================================================================

let kernelInstance: Kernel | null = null;

export function getKernel(config?: Partial<KernelConfig>): Kernel {
  if (!kernelInstance) {
    kernelInstance = new Kernel(config);
  }
  return kernelInstance;
}

export function resetKernel(): void {
  if (kernelInstance) {
    kernelInstance.stop();
    kernelInstance = null;
  }
}

// ============================================================================
// Re-export Invariants
// ============================================================================

export {
  InvariantRegistry,
  invariantRegistry,
  InvariantContext,
  InvariantResult,
  registerPhase51Invariants,
  registerPhase52Invariants,
  registerPhase53Invariants,
  registerAllPhase5Invariants,
  INV_006_CONSCIOUSNESS,
  INV_007_BUDGET,
  INV_008_WORLD_MODEL,
} from './invariants.js';
