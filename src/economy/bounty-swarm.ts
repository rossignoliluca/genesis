/**
 * Bounty Swarm v22.0
 *
 * Multi-agent collaborative bounty solving:
 * - Spawns specialized agents for different aspects of a bounty
 * - Coordinates via message passing
 * - Consensus-based solution validation
 * - Parallel exploration of solution space
 * - Emergent problem decomposition
 *
 * Agent Types:
 * - Analyst: Understands requirements and decomposes problems
 * - Coder: Generates code solutions
 * - Reviewer: Reviews and improves code
 * - Tester: Generates and runs tests
 * - Documenter: Writes documentation and PR descriptions
 *
 * @module economy/bounty-swarm
 * @version 22.0.0
 */

import { getEventBus, type GenesisEventBus } from '../bus/index.js';
import { getHybridRouter } from '../llm/router.js';
import { getMCPClient } from '../mcp/index.js';
import type { Bounty } from './generators/bounty-hunter.js';
import type { BountyClassification } from './bounty-intelligence.js';
import type { IssueAnalysis } from './issue-analyzer.js';
import type { CodeChange } from './live/pr-pipeline.js';

// ============================================================================
// Types
// ============================================================================

export type SwarmAgentRole = 'analyst' | 'coder' | 'reviewer' | 'tester' | 'documenter';

export interface SwarmAgent {
  id: string;
  role: SwarmAgentRole;
  status: 'idle' | 'working' | 'blocked' | 'done';
  currentTask?: string;
  output?: any;
  confidence: number;
}

export interface SwarmMessage {
  id: string;
  from: string;  // Agent ID
  to: string | 'broadcast';  // Agent ID or broadcast
  type: 'request' | 'response' | 'proposal' | 'vote' | 'consensus';
  content: any;
  timestamp: Date;
}

export interface SwarmTask {
  id: string;
  description: string;
  requiredRole: SwarmAgentRole;
  dependencies: string[];  // Task IDs that must complete first
  status: 'pending' | 'assigned' | 'in_progress' | 'review' | 'done';
  assignedTo?: string;  // Agent ID
  output?: any;
}

export interface SwarmResult {
  bountyId: string;
  success: boolean;
  solution?: {
    changes: CodeChange[];
    tests: string[];
    prDescription: string;
    confidence: number;
  };
  agentContributions: Map<string, {
    role: SwarmAgentRole;
    tasksCompleted: number;
    confidence: number;
  }>;
  consensusScore: number;  // 0-1, how much agents agreed
  totalTime: number;
  error?: string;
}

export interface SwarmConfig {
  maxAgents: number;
  consensusThreshold: number;  // 0-1, required agreement level
  timeoutMs: number;
  enableParallelExploration: boolean;
  minConfidence: number;
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: SwarmConfig = {
  maxAgents: 5,
  consensusThreshold: 0.7,
  timeoutMs: 300000,  // 5 minutes
  enableParallelExploration: true,
  minConfidence: 0.6,
};

// ============================================================================
// Swarm Coordinator
// ============================================================================

export class BountySwarm {
  private config: SwarmConfig;
  private bus: GenesisEventBus;
  private router = getHybridRouter();
  private mcp = getMCPClient();

  private agents: Map<string, SwarmAgent> = new Map();
  private messages: SwarmMessage[] = [];
  private tasks: Map<string, SwarmTask> = new Map();
  private agentCounter = 0;

  constructor(config?: Partial<SwarmConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.bus = getEventBus();
  }

  // ===========================================================================
  // Main Swarm Entry Point
  // ===========================================================================

  /**
   * Solve a bounty using multi-agent swarm
   */
  async solve(
    bounty: Bounty,
    classification: BountyClassification,
    issueAnalysis?: IssueAnalysis
  ): Promise<SwarmResult> {
    const startTime = Date.now();
    console.log(`[BountySwarm] Starting swarm for: ${bounty.title}`);

    // Reset state
    this.agents.clear();
    this.messages = [];
    this.tasks.clear();

    try {
      // Phase 1: Spawn agents based on bounty complexity
      await this.spawnAgentsForBounty(classification);

      // Phase 2: Create and assign tasks
      await this.createTasksFromAnalysis(bounty, issueAnalysis);

      // Phase 3: Execute swarm loop
      const solution = await this.executeSwarmLoop(bounty, classification);

      // Phase 4: Build consensus
      const consensus = await this.buildConsensus();

      if (consensus.score < this.config.consensusThreshold) {
        return {
          bountyId: bounty.id,
          success: false,
          agentContributions: this.getContributions(),
          consensusScore: consensus.score,
          totalTime: Date.now() - startTime,
          error: `Consensus not reached (${(consensus.score * 100).toFixed(0)}% < ${(this.config.consensusThreshold * 100).toFixed(0)}%)`,
        };
      }

      return {
        bountyId: bounty.id,
        success: true,
        solution: {
          changes: solution.changes,
          tests: solution.tests,
          prDescription: solution.prDescription,
          confidence: consensus.score,
        },
        agentContributions: this.getContributions(),
        consensusScore: consensus.score,
        totalTime: Date.now() - startTime,
      };

    } catch (error) {
      console.error('[BountySwarm] Swarm failed:', error);
      return {
        bountyId: bounty.id,
        success: false,
        agentContributions: this.getContributions(),
        consensusScore: 0,
        totalTime: Date.now() - startTime,
        error: String(error),
      };
    }
  }

  // ===========================================================================
  // Agent Management
  // ===========================================================================

  private async spawnAgentsForBounty(classification: BountyClassification): Promise<void> {
    const requiredRoles = this.determineRequiredRoles(classification);

    for (const role of requiredRoles) {
      this.spawnAgent(role);
    }

    console.log(`[BountySwarm] Spawned ${this.agents.size} agents: ${requiredRoles.join(', ')}`);
  }

  private determineRequiredRoles(classification: BountyClassification): SwarmAgentRole[] {
    const roles: SwarmAgentRole[] = ['analyst', 'coder'];

    // Add reviewer for complex bounties
    if (classification.estimatedDifficulty > 0.5) {
      roles.push('reviewer');
    }

    // Add tester if tests are expected
    if (classification.type !== 'documentation') {
      roles.push('tester');
    }

    // Add documenter for features and large changes
    if (classification.type.includes('feature') || classification.estimatedDifficulty > 0.7) {
      roles.push('documenter');
    }

    return roles.slice(0, this.config.maxAgents);
  }

  private spawnAgent(role: SwarmAgentRole): SwarmAgent {
    const id = `agent-${role}-${++this.agentCounter}`;
    const agent: SwarmAgent = {
      id,
      role,
      status: 'idle',
      confidence: 0.5,
    };
    this.agents.set(id, agent);
    return agent;
  }

  // ===========================================================================
  // Task Management
  // ===========================================================================

  private async createTasksFromAnalysis(
    bounty: Bounty,
    issueAnalysis?: IssueAnalysis
  ): Promise<void> {
    // Task 1: Analyze requirements (analyst)
    this.createTask({
      id: 'analyze',
      description: `Analyze requirements for: ${bounty.title}`,
      requiredRole: 'analyst',
      dependencies: [],
    });

    // Task 2: Generate solution (coder)
    this.createTask({
      id: 'code',
      description: `Generate code solution based on analysis`,
      requiredRole: 'coder',
      dependencies: ['analyze'],
    });

    // Task 3: Review code (reviewer)
    if (this.hasAgent('reviewer')) {
      this.createTask({
        id: 'review',
        description: `Review and improve the generated code`,
        requiredRole: 'reviewer',
        dependencies: ['code'],
      });
    }

    // Task 4: Generate tests (tester)
    if (this.hasAgent('tester')) {
      this.createTask({
        id: 'test',
        description: `Generate tests for the solution`,
        requiredRole: 'tester',
        dependencies: this.hasAgent('reviewer') ? ['review'] : ['code'],
      });
    }

    // Task 5: Write documentation (documenter)
    if (this.hasAgent('documenter')) {
      const lastTask = this.hasAgent('tester') ? 'test' : (this.hasAgent('reviewer') ? 'review' : 'code');
      this.createTask({
        id: 'document',
        description: `Write PR description and documentation`,
        requiredRole: 'documenter',
        dependencies: [lastTask],
      });
    }

    console.log(`[BountySwarm] Created ${this.tasks.size} tasks`);
  }

  private createTask(task: Omit<SwarmTask, 'status'>): void {
    this.tasks.set(task.id, { ...task, status: 'pending' });
  }

  private hasAgent(role: SwarmAgentRole): boolean {
    return Array.from(this.agents.values()).some(a => a.role === role);
  }

  // ===========================================================================
  // Swarm Execution Loop
  // ===========================================================================

  private async executeSwarmLoop(
    bounty: Bounty,
    classification: BountyClassification
  ): Promise<{ changes: CodeChange[]; tests: string[]; prDescription: string }> {
    const timeout = Date.now() + this.config.timeoutMs;
    let changes: CodeChange[] = [];
    let tests: string[] = [];
    let prDescription = '';

    while (Date.now() < timeout) {
      // Find ready tasks (all dependencies done)
      const readyTasks = Array.from(this.tasks.values()).filter(t =>
        t.status === 'pending' &&
        t.dependencies.every(depId => this.tasks.get(depId)?.status === 'done')
      );

      if (readyTasks.length === 0 && this.allTasksDone()) {
        break;  // All done
      }

      // Assign ready tasks to idle agents
      for (const task of readyTasks) {
        const agent = this.findIdleAgent(task.requiredRole);
        if (agent) {
          await this.assignTask(agent, task, bounty, classification);
        }
      }

      // Execute one iteration
      await this.executeIteration();

      // Collect outputs
      for (const task of this.tasks.values()) {
        if (task.status === 'done' && task.output) {
          if (task.id === 'code' || task.id === 'review') {
            changes = task.output.changes || changes;
          }
          if (task.id === 'test') {
            tests = task.output.tests || tests;
          }
          if (task.id === 'document') {
            prDescription = task.output.prDescription || prDescription;
          }
        }
      }

      // Small delay to prevent tight loop
      await new Promise(r => setTimeout(r, 100));
    }

    return { changes, tests, prDescription };
  }

  private allTasksDone(): boolean {
    return Array.from(this.tasks.values()).every(t => t.status === 'done');
  }

  private findIdleAgent(role: SwarmAgentRole): SwarmAgent | undefined {
    return Array.from(this.agents.values()).find(a =>
      a.role === role && a.status === 'idle'
    );
  }

  private async assignTask(
    agent: SwarmAgent,
    task: SwarmTask,
    bounty: Bounty,
    classification: BountyClassification
  ): Promise<void> {
    agent.status = 'working';
    agent.currentTask = task.id;
    task.status = 'assigned';
    task.assignedTo = agent.id;

    console.log(`[BountySwarm] Assigned ${task.id} to ${agent.id}`);

    // Send task request
    this.sendMessage({
      from: 'coordinator',
      to: agent.id,
      type: 'request',
      content: {
        taskId: task.id,
        bounty,
        classification,
        dependencies: this.getDependencyOutputs(task),
      },
    });
  }

  private getDependencyOutputs(task: SwarmTask): any[] {
    return task.dependencies
      .map(depId => this.tasks.get(depId)?.output)
      .filter(Boolean);
  }

  private async executeIteration(): Promise<void> {
    // Process each working agent
    for (const agent of this.agents.values()) {
      if (agent.status === 'working' && agent.currentTask) {
        const task = this.tasks.get(agent.currentTask);
        if (task && task.status === 'assigned') {
          task.status = 'in_progress';
          const output = await this.executeAgentTask(agent, task);
          task.output = output;
          task.status = 'done';
          agent.status = 'done';
          agent.output = output;
          agent.confidence = output.confidence || 0.5;
        }
      }
    }
  }

  private async executeAgentTask(agent: SwarmAgent, task: SwarmTask): Promise<any> {
    const request = this.messages.find(m =>
      m.to === agent.id && m.type === 'request' && m.content.taskId === task.id
    );

    if (!request) {
      return { error: 'No request found' };
    }

    const { bounty, classification, dependencies } = request.content;

    switch (agent.role) {
      case 'analyst':
        return this.runAnalystTask(bounty, classification);
      case 'coder':
        return this.runCoderTask(bounty, dependencies);
      case 'reviewer':
        return this.runReviewerTask(bounty, dependencies);
      case 'tester':
        return this.runTesterTask(bounty, dependencies);
      case 'documenter':
        return this.runDocumenterTask(bounty, dependencies);
      default:
        return { error: 'Unknown role' };
    }
  }

  // ===========================================================================
  // Agent Task Implementations
  // ===========================================================================

  private async runAnalystTask(bounty: Bounty, classification: BountyClassification): Promise<any> {
    const prompt = `Analyze this bounty and break it down into implementation steps:

Title: ${bounty.title}
Description: ${bounty.description}
Type: ${classification.type}
Difficulty: ${(classification.estimatedDifficulty * 100).toFixed(0)}%

Provide:
1. Problem statement (1-2 sentences)
2. Key requirements (bullet points)
3. Implementation approach (high-level steps)
4. Potential challenges
5. Success criteria`;

    try {
      const systemPrompt = 'You are a senior software analyst. Be concise and actionable.';
      const response = await this.router.execute(prompt, systemPrompt);

      return {
        analysis: response.content,
        requirements: this.extractRequirements(response.content),
        confidence: 0.8,
      };
    } catch (error) {
      return { error: String(error), confidence: 0 };
    }
  }

  private async runCoderTask(bounty: Bounty, dependencies: any[]): Promise<any> {
    const analysis = dependencies[0]?.analysis || bounty.description;

    const prompt = `Generate code to solve this bounty:

Title: ${bounty.title}
Analysis: ${analysis}

Requirements:
- Follow best practices
- Keep changes minimal and focused
- Include inline comments for complex logic

Respond with the code changes needed in this format:
\`\`\`json
{
  "changes": [
    {
      "path": "src/file.ts",
      "operation": "create",
      "content": "// full file content"
    }
  ]
}
\`\`\``;

    try {
      const systemPrompt = 'You are an expert coder. Generate clean, production-ready code.';
      const response = await this.router.execute(prompt, systemPrompt);

      const changes = this.extractCodeChanges(response.content);
      return { changes, confidence: 0.7 };
    } catch (error) {
      return { error: String(error), changes: [], confidence: 0 };
    }
  }

  private async runReviewerTask(bounty: Bounty, dependencies: any[]): Promise<any> {
    const changes = dependencies[0]?.changes || [];

    if (changes.length === 0) {
      return { changes: [], improvements: [], confidence: 0.5 };
    }

    const prompt = `Review this code and suggest improvements:

${changes.map((c: any) => `File: ${c.path}\n\`\`\`\n${c.content?.slice(0, 1000)}\n\`\`\``).join('\n\n')}

Provide:
1. Issues found (if any)
2. Suggested improvements
3. Improved code (if needed)`;

    try {
      const systemPrompt = 'You are a senior code reviewer. Be constructive and thorough.';
      const response = await this.router.execute(prompt, systemPrompt);

      const improvements = this.extractImprovements(response.content);
      return {
        changes: improvements.length > 0 ? improvements : changes,
        reviewNotes: response.content,
        confidence: 0.8,
      };
    } catch (error) {
      return { changes, error: String(error), confidence: 0.5 };
    }
  }

  private async runTesterTask(bounty: Bounty, dependencies: any[]): Promise<any> {
    const changes = dependencies[0]?.changes || [];

    const prompt = `Generate tests for these code changes:

${changes.map((c: any) => `File: ${c.path}`).join(', ')}

Requirements:
- Use appropriate test framework (Jest, Vitest, etc.)
- Cover edge cases
- Include at least 3 test cases

Provide test code.`;

    try {
      const systemPrompt = 'You are a QA engineer. Write comprehensive, maintainable tests.';
      const response = await this.router.execute(prompt, systemPrompt);

      return {
        tests: [response.content],
        testCount: this.countTests(response.content),
        confidence: 0.75,
      };
    } catch (error) {
      return { tests: [], error: String(error), confidence: 0 };
    }
  }

  private async runDocumenterTask(bounty: Bounty, dependencies: any[]): Promise<any> {
    const changes = dependencies[0]?.changes || [];
    const tests = dependencies[0]?.tests || [];

    const prompt = `Write a PR description for this bounty solution:

Bounty: ${bounty.title}
Files changed: ${changes.map((c: any) => c.path).join(', ')}
Tests: ${tests.length > 0 ? 'Included' : 'Not included'}

Format:
## Summary
[Brief description]

## Changes
[Bullet points]

## Testing
[How to test]

Fixes #${bounty.sourceMetadata?.issueNumber || 'XXX'}`;

    try {
      const systemPrompt = 'You are a technical writer. Write clear, professional PR descriptions.';
      const response = await this.router.execute(prompt, systemPrompt);

      return {
        prDescription: response.content,
        confidence: 0.85,
      };
    } catch (error) {
      return { prDescription: '', error: String(error), confidence: 0 };
    }
  }

  // ===========================================================================
  // Consensus Building
  // ===========================================================================

  private async buildConsensus(): Promise<{ score: number; votes: Map<string, boolean> }> {
    const votes = new Map<string, boolean>();
    let totalWeight = 0;
    let positiveWeight = 0;

    // Each agent votes on the final solution based on their confidence
    for (const agent of this.agents.values()) {
      if (agent.status === 'done' && agent.confidence > 0) {
        const vote = agent.confidence >= this.config.minConfidence;
        votes.set(agent.id, vote);
        totalWeight += agent.confidence;
        if (vote) {
          positiveWeight += agent.confidence;
        }
      }
    }

    const score = totalWeight > 0 ? positiveWeight / totalWeight : 0;

    console.log(`[BountySwarm] Consensus: ${(score * 100).toFixed(0)}% (${votes.size} votes)`);

    return { score, votes };
  }

  // ===========================================================================
  // Message Passing
  // ===========================================================================

  private sendMessage(msg: Omit<SwarmMessage, 'id' | 'timestamp'>): void {
    const message: SwarmMessage = {
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      timestamp: new Date(),
      ...msg,
    };
    this.messages.push(message);
  }

  // ===========================================================================
  // Helper Methods
  // ===========================================================================

  private extractRequirements(text: string): string[] {
    const lines = text.split('\n');
    return lines
      .filter(l => l.trim().startsWith('-') || l.trim().match(/^\d+\./))
      .map(l => l.replace(/^[-\d.]+\s*/, '').trim())
      .filter(l => l.length > 0)
      .slice(0, 10);
  }

  private extractCodeChanges(text: string): CodeChange[] {
    try {
      const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[1]);
        return parsed.changes || [];
      }
    } catch {
      // Failed to parse JSON
    }

    // Fallback: try to extract code blocks
    const codeBlocks = text.match(/```(?:typescript|javascript|ts|js)?\s*([\s\S]*?)\s*```/g) || [];
    return codeBlocks.map((block, i) => ({
      path: `src/solution-${i}.ts`,
      operation: 'create' as const,
      content: block.replace(/```[a-z]*\s*/g, '').replace(/```$/g, '').trim(),
    }));
  }

  private extractImprovements(text: string): CodeChange[] {
    // Similar to extractCodeChanges but looks for improved code
    return this.extractCodeChanges(text);
  }

  private countTests(text: string): number {
    const testPatterns = [
      /it\s*\(/g,
      /test\s*\(/g,
      /describe\s*\(/g,
    ];
    return testPatterns.reduce((sum, p) => sum + (text.match(p)?.length || 0), 0);
  }

  private getContributions(): Map<string, { role: SwarmAgentRole; tasksCompleted: number; confidence: number }> {
    const contributions = new Map<string, { role: SwarmAgentRole; tasksCompleted: number; confidence: number }>();

    for (const agent of this.agents.values()) {
      const tasksCompleted = Array.from(this.tasks.values())
        .filter(t => t.assignedTo === agent.id && t.status === 'done')
        .length;

      contributions.set(agent.id, {
        role: agent.role,
        tasksCompleted,
        confidence: agent.confidence,
      });
    }

    return contributions;
  }

  // ===========================================================================
  // Public API
  // ===========================================================================

  getAgents(): SwarmAgent[] {
    return Array.from(this.agents.values());
  }

  getTasks(): SwarmTask[] {
    return Array.from(this.tasks.values());
  }

  getMessages(): SwarmMessage[] {
    return [...this.messages];
  }
}

// ============================================================================
// Singleton
// ============================================================================

let swarm: BountySwarm | null = null;

export function getBountySwarm(config?: Partial<SwarmConfig>): BountySwarm {
  if (!swarm) {
    swarm = new BountySwarm(config);
  }
  return swarm;
}

export function resetBountySwarm(): void {
  swarm = null;
}
