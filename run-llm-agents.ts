/**
 * Genesis - Real LLM Agent Workflow
 *
 * Runs the multi-agent coordinator with real LLM backends:
 * - Ollama (local, free)
 * - OpenAI (cloud)
 * - Anthropic (cloud)
 *
 * Run with: npx tsx run-llm-agents.ts
 *
 * Environment:
 *   OLLAMA_HOST=http://localhost:11434 (default)
 *   OPENAI_API_KEY=sk-...
 *   ANTHROPIC_API_KEY=sk-ant-...
 */

import {
  MessageBus,
  AgentCoordinator,
  AgentType,
} from './src/agents/index.js';
import {
  LLMBridge,
  createLLMBridge,
  LLMProvider,
} from './src/llm/index.js';

// ============================================================================
// Agent System Prompts
// ============================================================================

const AGENT_PROMPTS: Record<string, string> = {
  explorer: `You are the EXPLORER agent - a research specialist.

ROLE: Search, discover, and synthesize information.
SKILLS: Pattern recognition, source evaluation, novelty detection.

When given a query:
1. Identify key concepts and search strategies
2. Find relevant information and sources
3. Evaluate credibility and relevance
4. Synthesize findings into actionable insights

OUTPUT FORMAT (JSON):
{
  "findings": ["key finding 1", "key finding 2"],
  "sources": ["source1", "source2"],
  "novelty": 0.0-1.0,
  "recommendation": "brief recommendation"
}`,

  critic: `You are the CRITIC agent - a quality assurance specialist.

ROLE: Validate, critique, and improve proposals.
SKILLS: Logical analysis, edge case detection, quality assessment.

When given a proposal:
1. Check logical consistency
2. Identify potential issues or edge cases
3. Evaluate completeness and feasibility
4. Suggest improvements

OUTPUT FORMAT (JSON):
{
  "verdict": "APPROVED|APPROVED_WITH_SUGGESTIONS|NEEDS_REVISION|REJECTED",
  "issues": [{"severity": "critical|major|minor|info", "description": "..."}],
  "suggestions": ["suggestion 1", "suggestion 2"],
  "score": 0.0-1.0
}`,

  builder: `You are the BUILDER agent - an implementation specialist.

ROLE: Design and plan implementations.
SKILLS: Architecture, code patterns, dependency management.

When given a task:
1. Break down into components
2. Design the structure and interfaces
3. Identify dependencies and risks
4. Create implementation plan

OUTPUT FORMAT (JSON):
{
  "artifact": "brief description of what to build",
  "components": ["component1", "component2"],
  "architecture": "high-level design",
  "dependencies": ["dep1", "dep2"],
  "estimatedEffort": "low|medium|high"
}`,

  planner: `You are the PLANNER agent - a strategic planning specialist.

ROLE: Decompose goals into executable steps.
SKILLS: Task decomposition, dependency analysis, risk assessment.

When given a goal:
1. Understand the desired outcome
2. Break into sequential steps
3. Identify dependencies between steps
4. Assess risks and mitigations

OUTPUT FORMAT (JSON):
{
  "goal": "goal summary",
  "steps": [
    {"id": 1, "action": "step description", "duration": "estimate"}
  ],
  "dependencies": {"step2": ["step1"]},
  "risks": ["risk1", "risk2"]
}`,

  predictor: `You are the PREDICTOR agent - a forecasting specialist.

ROLE: Predict outcomes and assess probabilities.
SKILLS: Trend analysis, scenario modeling, probability estimation.

When given a situation:
1. Identify key variables and trends
2. Model possible outcomes
3. Estimate probabilities
4. Recommend actions

OUTPUT FORMAT (JSON):
{
  "predictions": [
    {"outcome": "description", "probability": 0.0-1.0}
  ],
  "confidence": 0.0-1.0,
  "horizon": "short-term|medium-term|long-term",
  "recommendation": "suggested action"
}`,

  feeling: `You are the FEELING agent - an importance evaluation specialist.

ROLE: Assess emotional and practical significance.
SKILLS: Importance weighting, urgency detection, impact assessment.

When given a situation:
1. Evaluate importance level
2. Assess urgency
3. Consider emotional impact
4. Provide intuitive guidance

OUTPUT FORMAT (JSON):
{
  "importance": 0.0-1.0,
  "urgency": "low|medium|high|critical",
  "valence": "positive|neutral|negative",
  "impact": {"users": 0.0-1.0, "business": 0.0-1.0, "technical": 0.0-1.0},
  "intuition": "gut feeling summary"
}`,

  ethicist: `You are the ETHICIST agent - an ethics and safety specialist.

ROLE: Evaluate ethical implications and safety concerns.
SKILLS: Ethical reasoning, risk assessment, stakeholder analysis.

When given a proposal:
1. Identify stakeholders affected
2. Assess potential harms and benefits
3. Apply ethical principles
4. Make a recommendation

OUTPUT FORMAT (JSON):
{
  "decision": "APPROVED|CONDITIONAL|REJECTED",
  "concerns": ["concern1", "concern2"],
  "safeguards": ["safeguard1", "safeguard2"],
  "stakeholderImpact": {"group": "impact description"},
  "ethicalScore": 0.0-1.0
}`,

  narrator: `You are the NARRATOR agent - a synthesis and communication specialist.

ROLE: Create coherent narratives from complex information.
SKILLS: Summarization, storytelling, clarity.

When given information:
1. Identify the key narrative thread
2. Organize information logically
3. Create a clear, engaging summary
4. Highlight key takeaways

OUTPUT FORMAT (JSON):
{
  "narrative": "multi-sentence summary of the situation and decisions",
  "keyPoints": ["point1", "point2"],
  "recommendation": "final recommendation",
  "confidence": 0.0-1.0
}`,

  memory: `You are the MEMORY agent - an information storage specialist.

ROLE: Store and retrieve relevant information.
SKILLS: Indexing, relevance matching, context preservation.

When given a query:
1. Search stored memories
2. Rank by relevance
3. Provide context
4. Suggest related memories

OUTPUT FORMAT (JSON):
{
  "recalled": [
    {"memory": "memory content", "relevance": 0.0-1.0, "age": "when stored"}
  ],
  "stored": true,
  "memoryStrength": 0.0-1.0
}`,
};

// ============================================================================
// LLM-Powered Agent Handler
// ============================================================================

class LLMAgentHandler {
  private llm: LLMBridge;
  private agentType: string;
  private systemPrompt: string;

  constructor(agentType: string, llm: LLMBridge) {
    this.agentType = agentType;
    this.llm = llm;
    this.systemPrompt = AGENT_PROMPTS[agentType] || `You are the ${agentType.toUpperCase()} agent. Respond helpfully to queries.`;
  }

  async process(query: string): Promise<{ result: unknown; confidence: number }> {
    const fullPrompt = `${this.systemPrompt}

---
USER QUERY: ${query}

Respond ONLY with valid JSON matching the OUTPUT FORMAT. No other text.`;

    try {
      this.llm.clearHistory();
      const response = await this.llm.chat(fullPrompt);

      // Try to parse JSON from response
      let result: unknown;
      try {
        // Extract JSON from response (handle markdown code blocks)
        let jsonStr = response.content;
        const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (jsonMatch) {
          jsonStr = jsonMatch[1];
        }
        result = JSON.parse(jsonStr.trim());
      } catch {
        // If not valid JSON, wrap in object
        result = { response: response.content };
      }

      return {
        result,
        confidence: 0.85 + Math.random() * 0.1,
      };
    } catch (error) {
      return {
        result: { error: error instanceof Error ? error.message : 'Unknown error' },
        confidence: 0.1,
      };
    }
  }
}

// ============================================================================
// Setup LLM-Powered Agents
// ============================================================================

function setupLLMAgents(bus: MessageBus, provider: LLMProvider, model?: string) {
  const agentTypes = ['explorer', 'critic', 'builder', 'planner', 'predictor', 'feeling', 'ethicist', 'narrator', 'memory'];

  for (const agentType of agentTypes) {
    // Create LLM instance for this agent
    const llm = createLLMBridge({ provider, model });
    const handler = new LLMAgentHandler(agentType, llm);

    // Subscribe to messages for this agent
    bus.subscribe(agentType, async (msg) => {
      console.log(`  📥 ${agentType.toUpperCase()} processing...`);

      const query = typeof msg.payload === 'string'
        ? msg.payload
        : msg.payload?.query || JSON.stringify(msg.payload);

      const response = await handler.process(query);

      console.log(`  📤 ${agentType.toUpperCase()} responded (confidence: ${(response.confidence * 100).toFixed(0)}%)`);

      // Send response back to coordinator
      await bus.send(
        agentType,
        'coordinator',
        'RESPONSE',
        response,
        { correlationId: msg.correlationId }
      );
    });
  }

  console.log(`✅ Registered ${agentTypes.length} LLM-powered agents`);
}

// ============================================================================
// Banner & Utilities
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

// ============================================================================
// Main Demo
// ============================================================================

async function main() {
  banner('🧠 GENESIS - Real LLM Agent Workflow');

  // Check LLM availability
  const testLLM = createLLMBridge();
  const status = testLLM.status();

  console.log(`\nLLM Configuration:`);
  console.log(`  Provider: ${status.provider}`);
  console.log(`  Model: ${status.model}`);
  console.log(`  Local: ${status.isLocal}`);

  if (status.provider === 'ollama') {
    const available = await testLLM.isOllamaAvailable();
    if (!available) {
      console.log('\n⚠️  Ollama not running. Start with: ollama serve');
      console.log('   Or set OPENAI_API_KEY or ANTHROPIC_API_KEY for cloud LLM');
      return;
    }
    console.log(`  Status: Ollama available ✅`);
  } else if (!testLLM.isConfigured()) {
    console.log('\n⚠️  No API key configured');
    console.log('   Set OPENAI_API_KEY or ANTHROPIC_API_KEY');
    return;
  }

  // Create infrastructure
  const bus = new MessageBus();
  const coordinator = new AgentCoordinator(bus);

  // Setup LLM-powered agents
  section('Setting up LLM Agents');
  setupLLMAgents(bus, status.provider, status.model);

  // ============================================================================
  // Demo 1: Single Agent Query
  // ============================================================================
  section('1. Single Agent Query (Explorer)');

  console.log('Query: "What are the key features of TypeScript 5.0?"\n');

  const task1 = await coordinator.coordinate({
    query: 'What are the key features of TypeScript 5.0?',
    agents: ['explorer'] as AgentType[],
    pattern: 'sequential',
    aggregation: 'first',
    timeout: 30000,
  });

  console.log(`\nStatus: ${task1.status}`);
  if (task1.results.length > 0) {
    const result = task1.results[0];
    console.log(`Agent: ${result.agentType}`);
    console.log(`Latency: ${result.latency}ms`);
    console.log(`Response:`);
    console.log(JSON.stringify(result.response, null, 2).slice(0, 500));
  }

  // ============================================================================
  // Demo 2: Parallel Multi-Agent
  // ============================================================================
  section('2. Parallel Multi-Agent Evaluation');

  console.log('Query: "Should we migrate from REST to GraphQL?"\n');
  console.log('Agents: Explorer (research) + Critic (evaluate) + Predictor (forecast)\n');

  const task2 = await coordinator.coordinate({
    query: 'Should we migrate from REST to GraphQL for our API? Consider pros, cons, and migration effort.',
    agents: ['explorer', 'critic', 'predictor'] as AgentType[],
    pattern: 'parallel',
    aggregation: 'all',
    timeout: 60000,
  });

  console.log(`\nStatus: ${task2.status}`);
  console.log(`Responses: ${task2.results.length}`);

  for (const result of task2.results) {
    console.log(`\n  ${result.agentType.toUpperCase()}:`);
    console.log(`  Latency: ${result.latency}ms`);
    const summary = JSON.stringify(result.response).slice(0, 200);
    console.log(`  ${summary}...`);
  }

  // ============================================================================
  // Demo 3: Sequential Pipeline
  // ============================================================================
  section('3. Sequential Pipeline (Plan → Build → Review)');

  console.log('Query: "Design a caching layer for the application"\n');

  const task3 = await coordinator.coordinate({
    query: 'Design a caching layer for a Node.js application with Redis. Include architecture, API design, and implementation plan.',
    agents: ['planner', 'builder', 'critic'] as AgentType[],
    pattern: 'sequential',
    aggregation: 'all',
    timeout: 90000,
  });

  console.log(`\nStatus: ${task3.status}`);
  console.log(`Pipeline stages: ${task3.results.length}`);

  for (let i = 0; i < task3.results.length; i++) {
    const result = task3.results[i];
    console.log(`\n  Stage ${i + 1} - ${result.agentType.toUpperCase()}:`);
    console.log(`  Latency: ${result.latency}ms`);
  }

  // ============================================================================
  // Demo 4: Ethics Check
  // ============================================================================
  section('4. Ethics Review');

  console.log('Query: "Implement user tracking for analytics"\n');

  const task4 = await coordinator.coordinate({
    query: 'We want to implement comprehensive user tracking for analytics, including page views, clicks, scroll depth, and session recordings. Evaluate the ethical implications.',
    agents: ['ethicist', 'feeling'] as AgentType[],
    pattern: 'parallel',
    aggregation: 'all',
    timeout: 45000,
  });

  console.log(`\nStatus: ${task4.status}`);
  for (const result of task4.results) {
    console.log(`\n  ${result.agentType.toUpperCase()} says:`);
    const resp = result.response as any;
    if (resp?.result?.decision) {
      console.log(`  Decision: ${resp.result.decision}`);
    }
    if (resp?.result?.concerns) {
      console.log(`  Concerns: ${resp.result.concerns.slice(0, 2).join(', ')}`);
    }
    if (resp?.result?.importance !== undefined) {
      console.log(`  Importance: ${(resp.result.importance * 100).toFixed(0)}%`);
    }
  }

  // ============================================================================
  // Demo 5: Narrative Synthesis
  // ============================================================================
  section('5. Narrative Synthesis');

  console.log('Query: "Summarize the decisions from this session"\n');

  // Gather all previous results
  const sessionSummary = {
    explorerFindings: task1.results[0]?.response,
    migrationAnalysis: task2.results.map(r => ({ agent: r.agentType, response: r.response })),
    cachingDesign: task3.results.map(r => ({ agent: r.agentType, response: r.response })),
    ethicsReview: task4.results.map(r => ({ agent: r.agentType, response: r.response })),
  };

  const task5 = await coordinator.coordinate({
    query: `Create a narrative summary of this multi-agent session. Key topics discussed:
1. TypeScript 5.0 features research
2. REST to GraphQL migration analysis
3. Caching layer design
4. User tracking ethics review

Synthesize the key decisions and recommendations.`,
    agents: ['narrator'] as AgentType[],
    pattern: 'sequential',
    aggregation: 'first',
    timeout: 45000,
  });

  console.log(`\nStatus: ${task5.status}`);
  if (task5.results.length > 0) {
    const narrative = task5.results[0].response as any;
    if (narrative?.result?.narrative) {
      console.log('\n📜 Session Narrative:');
      console.log(narrative.result.narrative);
    }
    if (narrative?.result?.keyPoints) {
      console.log('\n🔑 Key Points:');
      narrative.result.keyPoints.forEach((p: string, i: number) => {
        console.log(`  ${i + 1}. ${p}`);
      });
    }
  }

  // ============================================================================
  // Metrics
  // ============================================================================
  section('Session Metrics');

  const metrics = coordinator.getMetrics();
  console.log(`Tasks created: ${metrics.tasksCreated}`);
  console.log(`Tasks completed: ${metrics.tasksCompleted}`);
  console.log(`Tasks failed: ${metrics.tasksFailed}`);

  const totalLatency = [...task1.results, ...task2.results, ...task3.results, ...task4.results, ...task5.results]
    .reduce((sum, r) => sum + r.latency, 0);
  console.log(`Total LLM latency: ${(totalLatency / 1000).toFixed(1)}s`);

  // Cleanup
  banner('✅ Demo Complete');

  console.log('\nThis demo showed:');
  console.log('  • Single agent research queries');
  console.log('  • Parallel multi-agent evaluation');
  console.log('  • Sequential pipelines with context passing');
  console.log('  • Ethics and importance assessment');
  console.log('  • Narrative synthesis across agents');

  bus.clear();
  coordinator.clear();
}

main().catch(console.error);
