/**
 * Genesis 4.0 - Planner Agent
 *
 * Decomposes goals into steps, creates plans, manages dependencies.
 * The organizer: "First A, then B, then C"
 */

import { BaseAgent, registerAgentFactory } from './base-agent.js';
import { MessageBus, messageBus } from './message-bus.js';
import {
  Message,
  MessageType,
  Plan,
  PlanStep,
  AgentType,
} from './types.js';
import { randomUUID } from 'crypto';

// ============================================================================
// Planner Agent
// ============================================================================

export class PlannerAgent extends BaseAgent {
  // Active plans
  private plans: Map<string, Plan> = new Map();

  // Plan templates
  private templates: Map<string, Partial<Plan>> = new Map();

  constructor(bus: MessageBus = messageBus) {
    super({ type: 'planner' }, bus);
    this.initializeTemplates();
  }

  private initializeTemplates(): void {
    // Research template
    this.templates.set('research', {
      steps: [
        { id: 'search', description: 'Search for information', agent: 'explorer', dependencies: [], status: 'pending' },
        { id: 'evaluate', description: 'Evaluate findings', agent: 'feeling', dependencies: ['search'], status: 'pending' },
        { id: 'critique', description: 'Critique findings', agent: 'critic', dependencies: ['search'], status: 'pending' },
        { id: 'store', description: 'Store important findings', agent: 'memory', dependencies: ['evaluate', 'critique'], status: 'pending' },
      ],
    });

    // Build template
    this.templates.set('build', {
      steps: [
        { id: 'plan', description: 'Create build plan', agent: 'planner', dependencies: [], status: 'pending' },
        { id: 'ethics', description: 'Check ethical implications', agent: 'ethicist', dependencies: ['plan'], status: 'pending' },
        { id: 'build', description: 'Build artifact', agent: 'builder', dependencies: ['ethics'], status: 'pending' },
        { id: 'review', description: 'Review artifact', agent: 'critic', dependencies: ['build'], status: 'pending' },
        { id: 'store', description: 'Store artifact', agent: 'memory', dependencies: ['review'], status: 'pending' },
      ],
    });

    // Full pipeline template
    this.templates.set('pipeline', {
      steps: [
        { id: 'research', description: 'Research topic', agent: 'explorer', dependencies: [], status: 'pending' },
        { id: 'evaluate', description: 'Evaluate importance', agent: 'feeling', dependencies: ['research'], status: 'pending' },
        { id: 'design', description: 'Design solution', agent: 'planner', dependencies: ['research', 'evaluate'], status: 'pending' },
        { id: 'ethics', description: 'Ethics check', agent: 'ethicist', dependencies: ['design'], status: 'pending' },
        { id: 'build', description: 'Build solution', agent: 'builder', dependencies: ['ethics'], status: 'pending' },
        { id: 'critique', description: 'Critique solution', agent: 'critic', dependencies: ['build'], status: 'pending' },
        { id: 'iterate', description: 'Iterate if needed', agent: 'builder', dependencies: ['critique'], status: 'pending' },
        { id: 'store', description: 'Store result', agent: 'memory', dependencies: ['iterate'], status: 'pending' },
        { id: 'narrate', description: 'Narrate story', agent: 'narrator', dependencies: ['store'], status: 'pending' },
      ],
    });
  }

  // ============================================================================
  // Message Handling
  // ============================================================================

  protected getMessageTypes(): MessageType[] {
    return ['PLAN', 'QUERY', 'COMMAND'];
  }

  async process(message: Message): Promise<Message | null> {
    switch (message.type) {
      case 'PLAN':
        return this.handlePlanRequest(message);
      case 'QUERY':
        return this.handleQuery(message);
      case 'COMMAND':
        return this.handleCommand(message);
      default:
        return null;
    }
  }

  // ============================================================================
  // Planning Logic
  // ============================================================================

  private async handlePlanRequest(message: Message): Promise<Message | null> {
    const { goal, template, constraints } = message.payload;

    const plan = this.createPlan(goal, template, constraints);
    this.plans.set(plan.id, plan);

    this.log(`Created plan "${plan.id.slice(0, 8)}" for goal: "${goal}" (${plan.steps.length} steps)`);

    return {
      ...this.createResponse(message, 'RESPONSE', { plan }),
      id: '',
      timestamp: new Date(),
    };
  }

  createPlan(
    goal: string,
    templateName?: string,
    constraints?: string[]
  ): Plan {
    const plan: Plan = {
      id: randomUUID(),
      goal,
      steps: [],
      status: 'pending',
      createdAt: new Date(),
    };

    // Use template if specified
    if (templateName && this.templates.has(templateName)) {
      const template = this.templates.get(templateName)!;
      plan.steps = JSON.parse(JSON.stringify(template.steps || []));
    } else {
      // Generate plan from goal
      plan.steps = this.generateStepsFromGoal(goal);
    }

    // Apply constraints
    if (constraints) {
      this.applyConstraints(plan, constraints);
    }

    // Calculate estimated duration
    plan.estimatedDuration = this.estimateDuration(plan);

    return plan;
  }

  private generateStepsFromGoal(goal: string): PlanStep[] {
    const goalLower = goal.toLowerCase();
    const steps: PlanStep[] = [];

    // Analyze goal to determine steps
    if (goalLower.includes('research') || goalLower.includes('find') || goalLower.includes('search')) {
      steps.push(this.createStep('search', 'Search for information', 'explorer', []));
      steps.push(this.createStep('evaluate', 'Evaluate findings', 'feeling', ['search']));
      steps.push(this.createStep('store', 'Store findings', 'memory', ['evaluate']));
    }

    if (goalLower.includes('build') || goalLower.includes('create') || goalLower.includes('implement')) {
      const lastStep = steps.length > 0 ? steps[steps.length - 1].id : null;
      const deps = lastStep ? [lastStep] : [];

      steps.push(this.createStep('ethics', 'Check ethics', 'ethicist', deps));
      steps.push(this.createStep('build', 'Build artifact', 'builder', ['ethics']));
      steps.push(this.createStep('review', 'Review artifact', 'critic', ['build']));
    }

    if (goalLower.includes('analyze') || goalLower.includes('critique') || goalLower.includes('review')) {
      const lastStep = steps.length > 0 ? steps[steps.length - 1].id : null;
      const deps = lastStep ? [lastStep] : [];

      steps.push(this.createStep('analyze', 'Analyze target', 'critic', deps));
      steps.push(this.createStep('evaluate', 'Evaluate importance', 'feeling', ['analyze']));
    }

    // Default: at least explore and store
    if (steps.length === 0) {
      steps.push(this.createStep('explore', 'Explore goal', 'explorer', []));
      steps.push(this.createStep('evaluate', 'Evaluate', 'feeling', ['explore']));
      steps.push(this.createStep('store', 'Store results', 'memory', ['evaluate']));
    }

    return steps;
  }

  private createStep(
    id: string,
    description: string,
    agent: AgentType,
    dependencies: string[]
  ): PlanStep {
    return {
      id: `${id}-${randomUUID().slice(0, 4)}`,
      description,
      agent,
      dependencies,
      status: 'pending',
    };
  }

  private applyConstraints(plan: Plan, constraints: string[]): void {
    for (const constraint of constraints) {
      const constraintLower = constraint.toLowerCase();

      // Skip certain agents
      if (constraintLower.includes('no ethics')) {
        plan.steps = plan.steps.filter((s) => s.agent !== 'ethicist');
      }

      // Require certain agents
      if (constraintLower.includes('must review')) {
        if (!plan.steps.some((s) => s.agent === 'critic')) {
          const lastStep = plan.steps[plan.steps.length - 1];
          plan.steps.push(this.createStep('review', 'Review', 'critic', [lastStep.id]));
        }
      }
    }

    // Revalidate dependencies after modifications
    this.validateDependencies(plan);
  }

  private validateDependencies(plan: Plan): void {
    const stepIds = new Set(plan.steps.map((s) => s.id));

    for (const step of plan.steps) {
      // Remove invalid dependencies
      step.dependencies = step.dependencies.filter((d) => stepIds.has(d));
    }
  }

  private estimateDuration(plan: Plan): number {
    // Simple estimation: 1 minute per step (would be more sophisticated in production)
    return plan.steps.length * 60 * 1000;
  }

  // ============================================================================
  // Plan Execution
  // ============================================================================

  async executePlan(planId: string): Promise<void> {
    const plan = this.plans.get(planId);
    if (!plan) {
      throw new Error(`Plan not found: ${planId}`);
    }

    plan.status = 'in_progress';

    // Execute steps in dependency order
    const executed = new Set<string>();

    while (executed.size < plan.steps.length) {
      // Find steps that can be executed
      const ready = plan.steps.filter((step) => {
        if (step.status !== 'pending') return false;
        return step.dependencies.every((d) => executed.has(d));
      });

      if (ready.length === 0) {
        // No ready steps but not all executed = deadlock or failure
        plan.status = 'failed';
        this.log(`Plan ${planId.slice(0, 8)} failed: no executable steps`);
        return;
      }

      // Execute ready steps (can be parallel)
      for (const step of ready) {
        step.status = 'in_progress';

        try {
          // Send task to appropriate agent
          const result = await this.bus.request(
            this.id,
            step.agent,
            'COMMAND',
            {
              command: 'execute_step',
              step: step.description,
              planId,
              stepId: step.id,
            },
            this.timeout
          );

          step.result = result.payload;
          step.status = 'completed';
          executed.add(step.id);
        } catch (error) {
          step.status = 'failed';
          this.log(`Step ${step.id} failed: ${error}`);
          // Could implement retry logic here
        }
      }
    }

    plan.status = 'completed';
    this.log(`Plan ${planId.slice(0, 8)} completed`);

    // Broadcast completion
    await this.broadcast('PLAN', {
      event: 'plan_completed',
      planId,
      goal: plan.goal,
      steps: plan.steps.length,
    });
  }

  // ============================================================================
  // Query
  // ============================================================================

  private async handleQuery(message: Message): Promise<Message | null> {
    const { query, planId } = message.payload;

    if (query === 'plan' && planId) {
      const plan = this.plans.get(planId);
      return {
        ...this.createResponse(message, 'RESPONSE', { plan }),
        id: '',
        timestamp: new Date(),
      };
    }

    if (query === 'templates') {
      return {
        ...this.createResponse(message, 'RESPONSE', {
          templates: Array.from(this.templates.keys()),
        }),
        id: '',
        timestamp: new Date(),
      };
    }

    if (query === 'active') {
      const active = Array.from(this.plans.values()).filter(
        (p) => p.status === 'pending' || p.status === 'in_progress'
      );
      return {
        ...this.createResponse(message, 'RESPONSE', { plans: active }),
        id: '',
        timestamp: new Date(),
      };
    }

    if (query === 'stats') {
      return {
        ...this.createResponse(message, 'RESPONSE', this.getStats()),
        id: '',
        timestamp: new Date(),
      };
    }

    return null;
  }

  // ============================================================================
  // Commands
  // ============================================================================

  private async handleCommand(message: Message): Promise<Message | null> {
    const { command, params } = message.payload;

    switch (command) {
      case 'execute':
        await this.executePlan(params.planId);
        return {
          ...this.createResponse(message, 'RESPONSE', { success: true }),
          id: '',
          timestamp: new Date(),
        };

      case 'cancel':
        const plan = this.plans.get(params.planId);
        if (plan) {
          plan.status = 'failed';
          plan.steps.forEach((s) => {
            if (s.status === 'pending' || s.status === 'in_progress') {
              s.status = 'skipped';
            }
          });
        }
        return {
          ...this.createResponse(message, 'RESPONSE', { success: true }),
          id: '',
          timestamp: new Date(),
        };

      default:
        return null;
    }
  }

  getStats() {
    const plans = Array.from(this.plans.values());
    return {
      totalPlans: plans.length,
      completed: plans.filter((p) => p.status === 'completed').length,
      failed: plans.filter((p) => p.status === 'failed').length,
      inProgress: plans.filter((p) => p.status === 'in_progress').length,
      pending: plans.filter((p) => p.status === 'pending').length,
      templates: this.templates.size,
    };
  }

  // ============================================================================
  // Public Methods
  // ============================================================================

  getPlan(planId: string): Plan | undefined {
    return this.plans.get(planId);
  }

  addTemplate(name: string, template: Partial<Plan>): void {
    this.templates.set(name, template);
  }
}

// ============================================================================
// Register Factory
// ============================================================================

registerAgentFactory('planner', (bus) => new PlannerAgent(bus));

export function createPlannerAgent(bus?: MessageBus): PlannerAgent {
  return new PlannerAgent(bus);
}
