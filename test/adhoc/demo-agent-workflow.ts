/**
 * Full Agent Workflow Demo
 *
 * Demonstrates the multi-agent coordination system with:
 * - Agent ecosystem creation
 * - Built-in workflows
 * - Coordination patterns (parallel, debate, voting)
 * - Custom workflows
 *
 * Run with: npx tsx demo-agent-workflow.ts
 */

import {
  MessageBus,
  AgentRegistry,
  AgentCoordinator,
  AgentType,
  createAgentEcosystem,
  getCoordinator,
} from './src/agents/index.js';

// ============================================================================
// Demo Utilities
// ============================================================================

function banner(text: string) {
  console.log('\n' + '═'.repeat(60));
  console.log(`  ${text}`);
  console.log('═'.repeat(60));
}

function section(text: string) {
  console.log(`\n▶ ${text}`);
  console.log('─'.repeat(50));
}

async function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================================
// Mock Agent Responses
// ============================================================================

function setupMockAgents(bus: MessageBus) {
  // Helper to create mock agent handlers
  const mockAgent = (
    agentType: string,
    responseData: Record<string, unknown>,
    delayMs: number = 50
  ) => {
    bus.subscribe(agentType, async (msg) => {
      await delay(delayMs);
      // Respond back to coordinator with correct correlation
      await bus.send(
        agentType,           // from
        'coordinator',       // to (back to coordinator)
        'RESPONSE',
        {
          result: responseData,
          confidence: 0.85 + Math.random() * 0.1,
        },
        { correlationId: msg.correlationId }
      );
    });
  };

  // Explorer agent - searches and discovers
  mockAgent('explorer', {
    findings: [
      'Found 3 relevant sources on the topic',
      'Key insight: The approach has 85% success rate in similar cases',
      'Related work suggests iterative refinement works best',
    ],
    sources: ['arxiv:2024.001', 'github/best-practices', 'docs/methodology'],
    novelty: 0.7,
  }, 50);

  // Critic agent - validates and critiques
  mockAgent('critic', {
    verdict: 'APPROVED_WITH_SUGGESTIONS',
    issues: [
      { severity: 'minor', description: 'Consider edge case handling' },
      { severity: 'info', description: 'Documentation could be expanded' },
    ],
    suggestions: [
      'Add input validation for robustness',
      'Include performance benchmarks',
    ],
    score: 0.82,
  }, 40);

  // Builder agent - creates and implements
  mockAgent('builder', {
    artifact: 'Implementation plan created',
    components: [
      'Core module with main logic',
      'API layer for external access',
      'Test suite with 95% coverage target',
    ],
    estimatedEffort: 'medium',
    dependencies: ['typescript', 'node:crypto'],
  }, 60);

  // Planner agent - decomposes and schedules
  mockAgent('planner', {
    plan: {
      goal: 'Implement the requested feature',
      steps: [
        { id: 1, action: 'Research existing solutions', duration: '1h' },
        { id: 2, action: 'Design architecture', duration: '2h' },
        { id: 3, action: 'Implement core logic', duration: '4h' },
        { id: 4, action: 'Add tests', duration: '2h' },
        { id: 5, action: 'Document and review', duration: '1h' },
      ],
      totalDuration: '10h',
      risks: ['Scope creep', 'Integration complexity'],
    },
  }, 50);

  // Predictor agent - forecasts outcomes
  mockAgent('predictor', {
    predictions: [
      { outcome: 'Success with current approach', probability: 0.75 },
      { outcome: 'Partial success, needs iteration', probability: 0.20 },
      { outcome: 'Major blockers encountered', probability: 0.05 },
    ],
    recommendation: 'Proceed with confidence',
    horizon: 'short-term',
  }, 45);

  // Feeling agent - evaluates importance
  mockAgent('feeling', {
    importance: 0.85,
    valence: 'positive',
    urgency: 'medium',
    emotionalImpact: {
      excitement: 0.7,
      concern: 0.2,
      confidence: 0.8,
    },
    recommendation: 'This is a valuable initiative worth pursuing',
  }, 30);

  // Ethicist agent - checks ethics and safety
  mockAgent('ethicist', {
    decision: 'APPROVED',
    ethicalScore: 0.95,
    concerns: [],
    safeguards: [
      'Ensure data privacy compliance',
      'Add user consent mechanisms',
      'Implement audit logging',
    ],
    priorityStack: ['Human welfare', 'Transparency', 'Fairness'],
  }, 35);

  // Narrator agent - creates narratives
  mockAgent('narrator', {
    narrative: `After careful deliberation by the agent council:

The Explorer discovered relevant prior work showing 85% success rates.
The Critic validated the approach with minor suggestions for improvement.
The Builder outlined a clear implementation plan with 3 core components.
The Predictor forecasts 75% probability of success.
The Ethicist approved with standard safeguards.

RECOMMENDATION: Proceed with implementation.`,
    summary: 'Approved for implementation with minor enhancements',
    keyPoints: [
      'Strong evidence base from research',
      'Clear implementation path',
      'High success probability',
      'Ethically sound',
    ],
  }, 55);

  // Memory agent - stores and retrieves
  mockAgent('memory', {
    stored: true,
    recalled: [
      { memory: 'Similar project completed successfully last month', relevance: 0.9 },
      { memory: 'Team has expertise in this technology stack', relevance: 0.85 },
    ],
    memoryStrength: 0.88,
  }, 25);
}

// ============================================================================
// Main Demo
// ============================================================================

async function main() {
  banner('🤖 GENESIS MULTI-AGENT WORKFLOW DEMO');

  // Create infrastructure
  const bus = new MessageBus();
  const coordinator = new AgentCoordinator(bus);

  // Setup mock agent responses
  setupMockAgents(bus);

  // ============================================================================
  // Demo 1: Agent Routing
  // ============================================================================
  section('1. Intelligent Agent Routing');

  const testTasks = [
    'Search for best practices in API design',
    'Build a user authentication module',
    'Review this code for security issues',
    'What will happen if we deploy on Friday?',
    'Is this approach ethical?',
    'Create a step-by-step implementation plan',
  ];

  console.log('Task → Best Agent:');
  for (const task of testTasks) {
    const agent = coordinator.findBestAgent(task);
    console.log(`  "${task.slice(0, 45)}..." → ${agent || 'unknown'}`);
  }

  // ============================================================================
  // Demo 2: Parallel Coordination
  // ============================================================================
  section('2. Parallel Agent Coordination');

  console.log('Running parallel task with Explorer, Critic, and Builder...\n');

  const parallelTask = await coordinator.coordinate({
    query: 'Evaluate and plan the implementation of a new caching layer',
    agents: ['explorer', 'critic', 'builder'] as AgentType[],
    pattern: 'parallel',
    aggregation: 'all',
    timeout: 5000,
  });

  console.log(`Status: ${parallelTask.status}`);
  console.log(`Responses received: ${parallelTask.results.length}`);

  for (const result of parallelTask.results) {
    console.log(`\n  📬 ${result.agentType.toUpperCase()}:`);
    console.log(`     Confidence: ${(result.confidence * 100).toFixed(0)}%`);
    console.log(`     Latency: ${result.latency}ms`);
    const response = result.response as any;
    if (response?.result) {
      const preview = JSON.stringify(response.result).slice(0, 100);
      console.log(`     Result: ${preview}...`);
    }
  }

  // ============================================================================
  // Demo 3: Sequential Pipeline
  // ============================================================================
  section('3. Sequential Pipeline (Plan → Build → Review)');

  console.log('Running: Planner → Builder → Critic\n');

  const sequentialTask = await coordinator.coordinate({
    query: 'Design and implement a rate limiter for the API',
    agents: ['planner', 'builder', 'critic'] as AgentType[],
    pattern: 'sequential',
    aggregation: 'all',
    timeout: 5000,
  });

  console.log(`Status: ${sequentialTask.status}`);
  console.log(`Pipeline stages completed: ${sequentialTask.results.length}`);

  for (let i = 0; i < sequentialTask.results.length; i++) {
    const result = sequentialTask.results[i];
    console.log(`\n  Stage ${i + 1} - ${result.agentType.toUpperCase()}:`);
    const response = result.response as any;
    if (response?.result?.plan) {
      console.log(`     Plan: ${response.result.plan.steps.length} steps`);
    } else if (response?.result?.artifact) {
      console.log(`     Artifact: ${response.result.artifact}`);
    } else if (response?.result?.verdict) {
      console.log(`     Verdict: ${response.result.verdict}`);
    }
  }

  // ============================================================================
  // Demo 4: Debate Pattern
  // ============================================================================
  section('4. Debate Pattern (Predictor vs Feeling vs Ethicist)');

  console.log('Agents debate: "Should we auto-scale during peak hours?"\n');

  const debateTask = await coordinator.coordinate({
    query: 'Should we enable automatic scaling during predicted peak hours?',
    agents: ['predictor', 'feeling', 'ethicist'] as AgentType[],
    pattern: 'debate',
    aggregation: 'majority',
    timeout: 5000,
  });

  console.log(`Status: ${debateTask.status}`);
  console.log(`Debate participants: ${debateTask.results.length}`);

  for (const result of debateTask.results) {
    console.log(`\n  🎤 ${result.agentType.toUpperCase()} argues:`);
    const response = result.response as any;
    if (response?.result?.recommendation) {
      console.log(`     "${response.result.recommendation}"`);
    } else if (response?.result?.decision) {
      console.log(`     Decision: ${response.result.decision}`);
    }
    console.log(`     Confidence: ${(result.confidence * 100).toFixed(0)}%`);
  }

  // ============================================================================
  // Demo 5: Full Deliberation Workflow
  // ============================================================================
  section('5. Full Deliberation Workflow');

  console.log('Executing "full-deliberation" workflow...');
  console.log('Stages: Gather Info → Analyze → Deliberate → Narrate\n');

  // Register event handlers
  coordinator.on('workflow:step', (step: any) => {
    console.log(`  ⚡ Step: ${step.name}`);
  });

  try {
    const workflowResult = await coordinator.executeWorkflow(
      'full-deliberation',
      'Should we migrate the database to a new provider?'
    );

    console.log(`\nWorkflow Status: ${workflowResult.status}`);
    console.log(`Steps completed: ${Object.keys(workflowResult.results).length}`);

    // Show step results
    for (const [stepId, stepResult] of Object.entries(workflowResult.results)) {
      console.log(`\n  📋 ${stepId}:`);
      if (Array.isArray(stepResult)) {
        console.log(`     Responses: ${stepResult.length} agents`);
      }
    }
  } catch (e: any) {
    console.log(`  Workflow timeout (expected in demo): ${e.message}`);
  }

  // ============================================================================
  // Demo 6: Custom Workflow
  // ============================================================================
  section('6. Custom Workflow Registration');

  coordinator.registerWorkflow({
    id: 'quick-review',
    name: 'Quick Review Pipeline',
    description: 'Fast review with Explorer and Critic',
    steps: [
      {
        id: 'research',
        name: 'Quick Research',
        agents: ['explorer'],
        pattern: 'sequential',
        aggregation: 'first',
        messageType: 'QUERY',
        timeout: 2000,
      },
      {
        id: 'review',
        name: 'Fast Review',
        agents: ['critic'],
        pattern: 'sequential',
        aggregation: 'first',
        messageType: 'CRITIQUE',
        timeout: 2000,
      },
    ],
    onError: 'skip',
  });

  const workflows = coordinator.getWorkflows();
  console.log(`Total registered workflows: ${workflows.length}`);
  for (const wf of workflows) {
    console.log(`  • ${wf.id}: ${wf.description}`);
  }

  // ============================================================================
  // Demo 7: Metrics Summary
  // ============================================================================
  section('7. Coordination Metrics');

  const metrics = coordinator.getMetrics();
  console.log(`Tasks created: ${metrics.tasksCreated}`);
  console.log(`Tasks completed: ${metrics.tasksCompleted}`);
  console.log(`Tasks failed: ${metrics.tasksFailed}`);
  console.log(`Workflows run: ${metrics.workflowsRun}`);
  console.log(`Registered workflows: ${metrics.registeredWorkflows}`);

  // ============================================================================
  // Demo 8: Agent Capabilities Overview
  // ============================================================================
  section('8. Agent Capabilities Matrix');

  const capabilities = coordinator.getAgentCapabilities();
  const coreAgents: AgentType[] = ['explorer', 'builder', 'critic', 'planner', 'predictor', 'ethicist'];

  console.log('Agent         | Primary Skills');
  console.log('─'.repeat(50));
  for (const agent of coreAgents) {
    const caps = capabilities[agent];
    if (caps) {
      const skills = caps.skills.slice(0, 4).join(', ');
      console.log(`${agent.padEnd(13)} | ${skills}`);
    }
  }

  // ============================================================================
  // Cleanup
  // ============================================================================
  banner('✅ DEMO COMPLETE');

  console.log('\nCapabilities demonstrated:');
  console.log('  • Intelligent task routing to specialized agents');
  console.log('  • Parallel execution for independent evaluations');
  console.log('  • Sequential pipelines for dependent workflows');
  console.log('  • Debate patterns for multi-perspective analysis');
  console.log('  • Built-in and custom workflow orchestration');
  console.log('  • Metrics and observability');

  coordinator.clear();
  bus.clear();
}

main().catch(console.error);
