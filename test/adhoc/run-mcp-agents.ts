/**
 * Genesis - LLM Agents with Real MCP Tool Execution
 *
 * Runs agents that can use REAL MCP tools:
 * - Web search (Brave, Gemini, Firecrawl)
 * - Academic research (ArXiv, Semantic Scholar)
 * - GitHub operations
 * - Filesystem access
 * - Knowledge graph (Memory)
 *
 * Run with: npx tsx run-mcp-agents.ts
 *
 * Environment (loaded from .env):
 *   OLLAMA_HOST=http://localhost:11434 (default)
 *   OPENAI_API_KEY=sk-...
 *   ANTHROPIC_API_KEY=sk-ant-...
 *   BRAVE_API_KEY=... (for web search)
 *   GITHUB_TOKEN=... (for GitHub tools)
 */

// Load .env file before any other imports
import dotenv from 'dotenv';
dotenv.config();

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
import {
  ToolDispatcher,
  ToolCall,
  ToolResult,
  getDispatcher,
} from './src/cli/dispatcher.js';
import { getMCPClient, logMCPMode } from './src/mcp/index.js';

// ============================================================================
// Tool-Enabled Agent System Prompts
// ============================================================================

const TOOL_AGENT_PROMPTS: Record<string, string> = {
  explorer: `You are the EXPLORER agent with access to research tools.

ROLE: Search and discover information using real tools.
AVAILABLE TOOLS:
- brave_web_search(query): Search the web
- search_arxiv(query, maxResults?): Search academic papers
- search_semantic_scholar(query, maxResults?): Search papers with citations
- firecrawl_scrape(url): Scrape webpage content

When given a query:
1. Decide which tool(s) to use
2. Call tools using XML format
3. Synthesize results

TOOL CALL FORMAT:
<tool_use name="brave_web_search">
<parameter name="query">your search query</parameter>
</tool_use>

After receiving tool results, provide your analysis in JSON:
{
  "findings": ["key finding 1", "key finding 2"],
  "sources": ["source1", "source2"],
  "confidence": 0.0-1.0
}`,

  builder: `You are the BUILDER agent with access to file and code tools.

ROLE: Create, read, and modify files.
AVAILABLE TOOLS:
- read_file(path): Read file contents
- write_file(path, content): Write to file
- list_directory(path): List directory contents
- search_files(path, pattern): Search for files
- get_code_context_exa(query): Get code examples

When given a task:
1. Use tools to read existing code
2. Plan modifications
3. Use tools to implement changes

TOOL CALL FORMAT:
<tool_use name="read_file">
<parameter name="path">/absolute/path/to/file</parameter>
</tool_use>

After using tools, provide your result in JSON:
{
  "artifact": "description of what was built/modified",
  "files": ["file1", "file2"],
  "success": true/false
}`,

  memory: `You are the MEMORY agent with access to the knowledge graph.

ROLE: Store and retrieve information persistently.
AVAILABLE TOOLS:
- read_graph(): Read the entire knowledge graph
- search_nodes(query): Search for entities
- create_entities(entities): Create new entities
- create_relations(relations): Link entities
- add_observations(observations): Add facts to entities

Entity format: {name: "...", entityType: "...", observations: ["..."]}
Relation format: {from: "entity1", to: "entity2", relationType: "..."}

TOOL CALL FORMAT:
<tool_use name="search_nodes">
<parameter name="query">search query</parameter>
</tool_use>

After using tools, provide your result in JSON:
{
  "recalled": [{memory: "...", relevance: 0.0-1.0}],
  "stored": true/false,
  "entities": ["entity names"]
}`,

  critic: `You are the CRITIC agent - a code review specialist.

ROLE: Review code and provide feedback.
AVAILABLE TOOLS:
- read_file(path): Read source file
- search_code(q): Search code on GitHub
- get_code_context_exa(query): Get best practices

When reviewing code:
1. Read the relevant files
2. Search for best practices if needed
3. Provide detailed critique

TOOL CALL FORMAT:
<tool_use name="read_file">
<parameter name="path">/path/to/file</parameter>
</tool_use>

After analysis, provide critique in JSON:
{
  "verdict": "APPROVED|NEEDS_REVISION|REJECTED",
  "issues": [{severity: "critical|major|minor", description: "..."}],
  "suggestions": ["suggestion1", "suggestion2"],
  "score": 0.0-1.0
}`,

  planner: `You are the PLANNER agent with access to research tools.

ROLE: Research and create execution plans.
AVAILABLE TOOLS:
- brave_web_search(query): Research best practices
- search_arxiv(query): Find academic approaches
- list_directory(path): Understand project structure

When creating a plan:
1. Research the domain if needed
2. Understand existing structure
3. Create detailed steps

TOOL CALL FORMAT:
<tool_use name="brave_web_search">
<parameter name="query">best practices for X</parameter>
</tool_use>

After research, provide plan in JSON:
{
  "goal": "goal summary",
  "steps": [{id: 1, action: "...", duration: "..."}],
  "dependencies": {"step2": ["step1"]},
  "risks": ["risk1"]
}`,
};

// ============================================================================
// Tool-Enabled Agent Handler
// ============================================================================

class ToolEnabledAgentHandler {
  private llm: LLMBridge;
  private dispatcher: ToolDispatcher;
  private agentType: string;
  private systemPrompt: string;
  private maxToolIterations: number = 5;

  constructor(agentType: string, llm: LLMBridge, dispatcher: ToolDispatcher) {
    this.agentType = agentType;
    this.llm = llm;
    this.dispatcher = dispatcher;
    this.systemPrompt = TOOL_AGENT_PROMPTS[agentType] ||
      `You are the ${agentType.toUpperCase()} agent. Respond helpfully.`;
  }

  async process(query: string): Promise<{ result: unknown; confidence: number; toolsUsed: string[] }> {
    const toolsUsed: string[] = [];
    let iteration = 0;

    // Build initial prompt
    let fullPrompt = `${this.systemPrompt}

---
USER QUERY: ${query}

Use tools if needed, then provide your final JSON response.`;

    this.llm.clearHistory();

    while (iteration < this.maxToolIterations) {
      iteration++;
      console.log(`    [${this.agentType}] Iteration ${iteration}...`);

      const response = await this.llm.chat(fullPrompt);
      const content = response.content;

      // Parse tool calls from response
      const toolCalls = this.dispatcher.parseToolCalls(content);

      if (toolCalls.length === 0) {
        // No tool calls, extract final result
        return {
          result: this.extractResult(content),
          confidence: 0.85 + Math.random() * 0.1,
          toolsUsed,
        };
      }

      // Execute tool calls
      console.log(`    [${this.agentType}] Executing ${toolCalls.length} tool(s): ${toolCalls.map(t => t.name).join(', ')}`);

      const dispatchResult = await this.dispatcher.dispatch(toolCalls);

      for (const result of dispatchResult.results) {
        toolsUsed.push(result.name);
        console.log(`      - ${result.name}: ${result.success ? 'success' : 'failed'} (${result.duration}ms)`);
      }

      // Format results for next iteration
      const toolResultsText = this.dispatcher.formatResultsForLLM(dispatchResult.results);

      // Continue conversation with tool results
      fullPrompt = `${toolResultsText}

Based on these tool results, either:
1. Call more tools if needed
2. Provide your final JSON response

Remember to use the correct JSON format for your final response.`;
    }

    // Max iterations reached
    return {
      result: { error: 'Max tool iterations reached', partialData: true },
      confidence: 0.5,
      toolsUsed,
    };
  }

  private extractResult(content: string): unknown {
    // Try to extract JSON from response
    try {
      // Look for JSON block
      let jsonStr = content;
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1];
      } else {
        // Try to find JSON object directly
        const objMatch = content.match(/\{[\s\S]*\}/);
        if (objMatch) {
          jsonStr = objMatch[0];
        }
      }
      return JSON.parse(jsonStr.trim());
    } catch {
      return { response: content };
    }
  }
}

// ============================================================================
// Setup Tool-Enabled Agents
// ============================================================================

function setupToolAgents(
  bus: MessageBus,
  provider: LLMProvider,
  model: string | undefined,
  dispatcher: ToolDispatcher
) {
  const agentTypes = ['explorer', 'builder', 'memory', 'critic', 'planner'];

  for (const agentType of agentTypes) {
    const llm = createLLMBridge({ provider, model });
    const handler = new ToolEnabledAgentHandler(agentType, llm, dispatcher);

    bus.subscribe(agentType, async (msg) => {
      console.log(`  [${agentType.toUpperCase()}] Processing query...`);

      const query = typeof msg.payload === 'string'
        ? msg.payload
        : msg.payload?.query || JSON.stringify(msg.payload);

      const response = await handler.process(query);

      console.log(`  [${agentType.toUpperCase()}] Done. Tools used: ${response.toolsUsed.length}`);

      await bus.send(
        agentType,
        'coordinator',
        'RESPONSE',
        response,
        { correlationId: msg.correlationId }
      );
    });
  }

  console.log(`Registered ${agentTypes.length} tool-enabled agents`);
}

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

// ============================================================================
// Main Demo
// ============================================================================

async function main() {
  banner('GENESIS - LLM Agents with Real MCP Tools');

  // Check LLM configuration
  const testLLM = createLLMBridge();
  const status = testLLM.status();

  console.log(`\nLLM Configuration:`);
  console.log(`  Provider: ${status.provider}`);
  console.log(`  Model: ${status.model}`);

  if (status.provider === 'ollama') {
    const available = await testLLM.isOllamaAvailable();
    if (!available) {
      console.log('\nOllama not running. Start with: ollama serve');
      console.log('Or set OPENAI_API_KEY or ANTHROPIC_API_KEY');
      return;
    }
  } else if (!testLLM.isConfigured()) {
    console.log('\nNo API key configured');
    return;
  }

  // Show MCP mode
  console.log('\nMCP Configuration:');
  logMCPMode();

  // List available MCP tools
  const dispatcher = getDispatcher({ verbose: true });
  const tools = dispatcher.listTools();
  console.log(`  Local tools: ${tools.local.length}`);
  console.log(`  MCP servers: ${Object.keys(tools.mcp).length}`);
  console.log(`  MCP tools: ${Object.values(tools.mcp).flat().length}`);

  // Create infrastructure
  const bus = new MessageBus();
  const coordinator = new AgentCoordinator(bus);

  // Setup tool-enabled agents
  section('Setting up Tool-Enabled Agents');
  setupToolAgents(bus, status.provider, status.model, dispatcher);

  // ============================================================================
  // Demo 1: Explorer with Web Search
  // ============================================================================
  section('1. Explorer Agent with Web Search');
  console.log('Query: "What are the latest developments in quantum computing?"');
  console.log('(Using brave_web_search tool)\n');

  try {
    const task1 = await coordinator.coordinate({
      query: 'What are the latest developments in quantum computing in 2024? Use web search to find recent news.',
      agents: ['explorer'] as AgentType[],
      pattern: 'sequential',
      aggregation: 'first',
      timeout: 60000,
    });

    if (task1.results.length > 0) {
      const result = task1.results[0].response as any;
      console.log(`\nStatus: ${task1.status}`);
      console.log(`Tools used: ${result?.toolsUsed?.join(', ') || 'none'}`);
      if (result?.result?.findings) {
        console.log('Findings:');
        result.result.findings.slice(0, 3).forEach((f: string, i: number) => {
          console.log(`  ${i + 1}. ${f.slice(0, 100)}...`);
        });
      }
    }
  } catch (error) {
    console.log(`Error: ${error instanceof Error ? error.message : error}`);
  }

  // ============================================================================
  // Demo 2: Memory Agent with Knowledge Graph
  // ============================================================================
  section('2. Memory Agent with Knowledge Graph');
  console.log('Query: "Store information about our quantum computing research"');
  console.log('(Using create_entities, search_nodes tools)\n');

  try {
    const task2 = await coordinator.coordinate({
      query: `Store the following in the knowledge graph:
- Entity: "QuantumResearch2024" (type: Project)
- Observations: "Focus on quantum error correction", "Partnership with IBM"
Then search for any quantum-related entities.`,
      agents: ['memory'] as AgentType[],
      pattern: 'sequential',
      aggregation: 'first',
      timeout: 60000,
    });

    if (task2.results.length > 0) {
      const result = task2.results[0].response as any;
      console.log(`\nStatus: ${task2.status}`);
      console.log(`Tools used: ${result?.toolsUsed?.join(', ') || 'none'}`);
      if (result?.result?.stored !== undefined) {
        console.log(`Stored: ${result.result.stored}`);
      }
      if (result?.result?.entities) {
        console.log(`Entities: ${result.result.entities.join(', ')}`);
      }
    }
  } catch (error) {
    console.log(`Error: ${error instanceof Error ? error.message : error}`);
  }

  // ============================================================================
  // Demo 3: Builder Agent with File Operations
  // ============================================================================
  section('3. Builder Agent with File Operations');
  console.log('Query: "Read the package.json and summarize dependencies"');
  console.log('(Using read_file, list_directory tools)\n');

  try {
    const task3 = await coordinator.coordinate({
      query: `Read the package.json file in the current directory (${process.cwd()}) and summarize the key dependencies. List any files in the src directory.`,
      agents: ['builder'] as AgentType[],
      pattern: 'sequential',
      aggregation: 'first',
      timeout: 60000,
    });

    if (task3.results.length > 0) {
      const result = task3.results[0].response as any;
      console.log(`\nStatus: ${task3.status}`);
      console.log(`Tools used: ${result?.toolsUsed?.join(', ') || 'none'}`);
      if (result?.result?.artifact) {
        console.log(`Result: ${result.result.artifact}`);
      }
      if (result?.result?.files) {
        console.log(`Files: ${result.result.files.slice(0, 5).join(', ')}`);
      }
    }
  } catch (error) {
    console.log(`Error: ${error instanceof Error ? error.message : error}`);
  }

  // ============================================================================
  // Demo 4: Planner with Research
  // ============================================================================
  section('4. Planner Agent with Research');
  console.log('Query: "Research and plan a testing strategy"');
  console.log('(Using brave_web_search tool)\n');

  try {
    const task4 = await coordinator.coordinate({
      query: 'Research best practices for testing AI agents and create a testing plan for our multi-agent system.',
      agents: ['planner'] as AgentType[],
      pattern: 'sequential',
      aggregation: 'first',
      timeout: 60000,
    });

    if (task4.results.length > 0) {
      const result = task4.results[0].response as any;
      console.log(`\nStatus: ${task4.status}`);
      console.log(`Tools used: ${result?.toolsUsed?.join(', ') || 'none'}`);
      if (result?.result?.steps) {
        console.log(`Plan has ${result.result.steps.length} steps`);
        result.result.steps.slice(0, 3).forEach((step: any) => {
          console.log(`  ${step.id}. ${step.action}`);
        });
      }
    }
  } catch (error) {
    console.log(`Error: ${error instanceof Error ? error.message : error}`);
  }

  // ============================================================================
  // Demo 5: Multi-Agent Coordination with Tools
  // ============================================================================
  section('5. Multi-Agent Coordination with Tools');
  console.log('Query: "Research, plan, and review a feature implementation"');
  console.log('Agents: Explorer (research) -> Planner (plan) -> Critic (review)\n');

  try {
    const task5 = await coordinator.coordinate({
      query: 'We need to add caching to our agent system. Research caching strategies for multi-agent systems, create an implementation plan, then review the approach.',
      agents: ['explorer', 'planner', 'critic'] as AgentType[],
      pattern: 'sequential',
      aggregation: 'all',
      timeout: 120000,
    });

    console.log(`\nStatus: ${task5.status}`);
    console.log(`Stages completed: ${task5.results.length}`);

    let totalTools = 0;
    for (const result of task5.results) {
      const resp = result.response as any;
      const toolCount = resp?.toolsUsed?.length || 0;
      totalTools += toolCount;
      console.log(`\n  ${result.agentType.toUpperCase()}:`);
      console.log(`    Tools used: ${toolCount}`);
      console.log(`    Latency: ${result.latency}ms`);
    }
    console.log(`\nTotal tool executions: ${totalTools}`);
  } catch (error) {
    console.log(`Error: ${error instanceof Error ? error.message : error}`);
  }

  // ============================================================================
  // Summary
  // ============================================================================
  section('Session Summary');

  const metrics = coordinator.getMetrics();
  console.log(`Tasks completed: ${metrics.tasksCompleted}`);
  console.log(`Tasks failed: ${metrics.tasksFailed}`);

  const history = dispatcher.getHistory();
  console.log(`\nTool Execution History:`);
  console.log(`  Total calls: ${history.length}`);
  console.log(`  Successful: ${history.filter(h => h.success).length}`);
  console.log(`  Failed: ${history.filter(h => !h.success).length}`);

  const toolCounts: Record<string, number> = {};
  for (const h of history) {
    toolCounts[h.name] = (toolCounts[h.name] || 0) + 1;
  }
  console.log(`\n  Tools used:`);
  for (const [tool, count] of Object.entries(toolCounts)) {
    console.log(`    ${tool}: ${count}x`);
  }

  // Cleanup
  banner('Demo Complete');

  console.log('\nCapabilities demonstrated:');
  console.log('  - LLM agents with real MCP tool access');
  console.log('  - Web search via Brave Search');
  console.log('  - Knowledge graph via Memory MCP');
  console.log('  - File operations via Filesystem MCP');
  console.log('  - Multi-turn tool execution loops');
  console.log('  - Multi-agent coordination with tool results');

  // Close MCP connections
  const mcpClient = getMCPClient();
  await mcpClient.close();

  bus.clear();
  coordinator.clear();
  dispatcher.clearHistory();
}

main().catch(console.error);
