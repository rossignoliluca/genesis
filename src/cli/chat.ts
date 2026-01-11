/**
 * Genesis 6.0 - Interactive Chat CLI
 *
 * REPL interface to talk to Genesis using readline.
 * No external dependencies.
 */

import * as readline from 'readline';
import { getLLMBridge, buildSystemPrompt, GENESIS_IDENTITY_PROMPT, LLMBridge } from '../llm/index.js';
import { getStateStore, StateStore } from '../persistence/index.js';
import { ToolDispatcher, ToolResult } from './dispatcher.js';
import { Brain, getBrain, BrainMetrics } from '../brain/index.js';

// ============================================================================
// Colors
// ============================================================================

const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  magenta: '\x1b[35m',
  blue: '\x1b[34m',
};

function c(text: string, color: keyof typeof colors): string {
  return `${colors[color]}${text}${colors.reset}`;
}

// ============================================================================
// Chat Session
// ============================================================================

export interface ChatOptions {
  provider?: 'ollama' | 'openai' | 'anthropic';
  model?: string;
  verbose?: boolean;
  enableTools?: boolean;  // Enable MCP tool execution
  enableBrain?: boolean;  // Enable Brain integration (Phase 10)
}

export class ChatSession {
  private llm: LLMBridge;
  private store: StateStore;
  private dispatcher: ToolDispatcher;
  private brain: Brain;  // Phase 10: Brain integration
  private rl: readline.Interface | null = null;
  private running = false;
  private verbose: boolean;
  private enableTools: boolean;
  private enableBrain: boolean;  // Phase 10: Brain mode
  private messageCount = 0;
  private toolExecutions = 0;
  private systemPrompt: string = '';  // Built dynamically at start()

  constructor(options: ChatOptions = {}) {
    this.llm = getLLMBridge({
      provider: options.provider,
      model: options.model,
    });
    this.store = getStateStore({ autoSave: true, autoSaveIntervalMs: 60000 });
    this.dispatcher = new ToolDispatcher({ verbose: options.verbose });
    this.brain = getBrain();  // Phase 10: Initialize brain
    this.verbose = options.verbose ?? false;
    this.enableTools = options.enableTools ?? true;  // Enabled by default
    this.enableBrain = options.enableBrain ?? false;  // Brain mode off by default (opt-in)

    // Restore conversation history from persisted state
    const state = this.store.getState();
    if (state.conversation.history.length > 0) {
      for (const msg of state.conversation.history) {
        this.llm.getHistory().push(msg);
      }
    }
  }

  /**
   * Start interactive chat session
   */
  async start(): Promise<void> {
    this.printBanner();

    // Build dynamic system prompt from available tools (with schemas)
    const tools = this.dispatcher.listToolsWithSchemas();
    this.systemPrompt = await buildSystemPrompt(tools.mcp, tools.local);

    if (this.verbose) {
      console.log(c('System prompt built dynamically:', 'dim'));
      console.log(c(`  Local tools: ${tools.local.length}`, 'dim'));
      console.log(c(`  MCP servers: ${Object.keys(tools.mcp).length}`, 'dim'));
      console.log();
    }

    // Check if LLM is configured
    if (!this.llm.isConfigured()) {
      console.log(c('\nWarning: No API key found!', 'yellow'));
      console.log('Set OPENAI_API_KEY or ANTHROPIC_API_KEY environment variable.\n');
      console.log('Example:');
      console.log(c('  export OPENAI_API_KEY=sk-...', 'dim'));
      console.log(c('  export ANTHROPIC_API_KEY=sk-ant-...', 'dim'));
      console.log();
    }

    const status = this.llm.status();
    console.log(c(`Provider: ${status.provider}`, 'dim'));
    console.log(c(`Model: ${status.model}`, 'dim'));
    console.log(c(`Status: ${status.configured ? 'Ready' : 'Not configured'}`, status.configured ? 'green' : 'yellow'));

    // Phase 10: Brain mode status
    if (this.enableBrain) {
      this.brain.start();
      console.log(c(`Brain: ${c('ACTIVE', 'green')} (Phase 10 Neural Integration)`, 'dim'));
    } else {
      console.log(c(`Brain: ${c('OFF', 'yellow')} (use /brain to enable)`, 'dim'));
    }
    console.log();

    this.printHelp();

    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    this.running = true;
    await this.chatLoop();
  }

  /**
   * Main chat loop
   */
  private async chatLoop(): Promise<void> {
    while (this.running && this.rl) {
      const input = await this.prompt();

      if (!input) continue;

      // Handle commands
      if (input.startsWith('/')) {
        await this.handleCommand(input);
        continue;
      }

      // Send to LLM
      await this.sendMessage(input);
    }
  }

  /**
   * Prompt for user input
   */
  private prompt(): Promise<string> {
    return new Promise((resolve) => {
      this.rl?.question(c('You: ', 'green'), (answer) => {
        resolve(answer.trim());
      });
    });
  }

  /**
   * Send message to LLM (or Brain if enabled)
   */
  private async sendMessage(message: string): Promise<void> {
    if (!this.llm.isConfigured()) {
      console.log(c('Error: LLM not configured. Set API key first.', 'red'));
      return;
    }

    // Phase 10: Use Brain for integrated processing
    if (this.enableBrain) {
      await this.sendMessageViaBrain(message);
      return;
    }

    console.log(c('Genesis: ', 'cyan') + c('thinking...', 'dim'));

    try {
      const response = await this.llm.chat(message, this.systemPrompt);
      this.messageCount++;

      // Clear "thinking..." line and print response
      process.stdout.write('\x1b[1A\x1b[2K'); // Move up and clear line
      console.log(c('Genesis: ', 'cyan') + response.content);

      if (this.verbose) {
        console.log(c(`  [${response.latency}ms, ${response.usage?.outputTokens || '?'} tokens]`, 'dim'));
      }

      // Check for tool calls if tools are enabled
      if (this.enableTools) {
        const toolCalls = this.dispatcher.parseToolCalls(response.content);

        if (toolCalls.length > 0) {
          console.log(c(`\n  [Executing ${toolCalls.length} tool(s)...]`, 'yellow'));

          const dispatchResult = await this.dispatcher.dispatch(toolCalls);
          this.toolExecutions += toolCalls.length;

          // Format results for re-injection
          const toolResults = this.formatToolResults(dispatchResult.results);

          if (this.verbose) {
            console.log(c(`  [Tools completed in ${dispatchResult.totalDuration}ms]`, 'dim'));
          }

          // Show results to user
          console.log(c('\n  Tool Results:', 'magenta'));
          for (const result of dispatchResult.results) {
            const status = result.success ? c('✓', 'green') : c('✗', 'red');
            const data = result.success
              ? (typeof result.data === 'string' ? result.data.substring(0, 200) : JSON.stringify(result.data).substring(0, 200))
              : result.error;
            console.log(`  ${status} ${result.name}: ${data}${data && data.length >= 200 ? '...' : ''}`);
          }
          console.log();

          // Feed results back to LLM for continued response
          console.log(c('Genesis: ', 'cyan') + c('processing results...', 'dim'));
          const followUp = await this.llm.chat(
            `Tool execution results:\n${toolResults}\n\nPlease provide a final response based on these results.`
          );

          process.stdout.write('\x1b[1A\x1b[2K'); // Clear processing line
          console.log(c('Genesis: ', 'cyan') + followUp.content);
        }
      }

      // Persist conversation to state
      this.store.updateConversation(this.llm.getHistory(), response.usage?.outputTokens);
      this.store.recordInteraction();

      console.log();
    } catch (error) {
      process.stdout.write('\x1b[1A\x1b[2K'); // Clear "thinking..." line
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.log(c(`Genesis: Error - ${errorMessage}`, 'red'));
      console.log();
    }
  }

  /**
   * Format tool results for LLM consumption
   */
  private formatToolResults(results: ToolResult[]): string {
    return results.map(r => {
      if (r.success) {
        const data = typeof r.data === 'string' ? r.data : JSON.stringify(r.data, null, 2);
        return `[${r.name}] SUCCESS:\n${data}`;
      } else {
        return `[${r.name}] ERROR: ${r.error}`;
      }
    }).join('\n\n');
  }

  /**
   * Phase 10: Send message via Brain (Neural Integration Layer)
   *
   * Routes through: Memory → LLM → Grounding → Tools → Response
   * With: φ monitoring, Global Workspace broadcasting, self-healing
   */
  private async sendMessageViaBrain(message: string): Promise<void> {
    console.log(c('Genesis: ', 'cyan') + c('processing via brain...', 'dim'));

    try {
      const response = await this.brain.process(message);
      this.messageCount++;

      // Clear "processing..." line and print response
      process.stdout.write('\x1b[1A\x1b[2K');
      console.log(c('Genesis: ', 'cyan') + response);

      // Show brain metrics if verbose
      if (this.verbose) {
        const metrics = this.brain.getMetrics();
        const reuseRate = metrics.memoryReuseRate * 100;
        console.log(c(`  [φ=${metrics.avgPhi.toFixed(2)}, reuse=${reuseRate.toFixed(0)}%, cycles=${metrics.totalCycles}]`, 'dim'));
      }

      // Persist interaction (Brain manages its own conversation context)
      this.store.recordInteraction();

      console.log();
    } catch (error) {
      process.stdout.write('\x1b[1A\x1b[2K'); // Clear "processing..." line
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.log(c(`Genesis: Brain error - ${errorMessage}`, 'red'));

      // Fallback to direct LLM if brain fails
      console.log(c('  [Falling back to direct LLM...]', 'yellow'));
      this.enableBrain = false;  // Temporarily disable
      await this.sendMessage(message);
      this.enableBrain = true;   // Re-enable for next message
    }
  }

  /**
   * Handle slash commands
   */
  private async handleCommand(input: string): Promise<void> {
    const [cmd, ...args] = input.slice(1).split(' ');

    switch (cmd.toLowerCase()) {
      case 'help':
      case 'h':
        this.printHelp();
        break;

      case 'clear':
      case 'c':
        this.llm.clearHistory();
        console.log(c('Conversation history cleared.', 'yellow'));
        console.log();
        break;

      case 'history':
        this.printHistory();
        break;

      case 'status':
      case 's':
        this.printStatus();
        break;

      case 'verbose':
      case 'v':
        this.verbose = !this.verbose;
        console.log(c(`Verbose mode: ${this.verbose ? 'ON' : 'OFF'}`, 'yellow'));
        console.log();
        break;

      case 'quit':
      case 'exit':
      case 'q':
        this.stop();
        break;

      case 'system':
        if (args.length > 0) {
          console.log(c('Custom system prompts not yet supported.', 'yellow'));
        } else {
          console.log(c('System Prompt (dynamically built):', 'cyan'));
          console.log(c('─'.repeat(60), 'dim'));
          console.log(this.systemPrompt || GENESIS_IDENTITY_PROMPT);
          console.log(c('─'.repeat(60), 'dim'));

          // Show tool stats with schemas
          const tools = this.dispatcher.listToolsWithSchemas();
          console.log(c(`\nTools discovered:`, 'yellow'));
          console.log(`  Local: ${tools.local.length}`);
          for (const tool of tools.local) {
            const desc = tool.description ? `: ${tool.description.slice(0, 40)}...` : '';
            console.log(`    - ${tool.name}${desc}`);
          }
          console.log(`  MCP servers: ${Object.keys(tools.mcp).length}`);
          for (const [server, serverTools] of Object.entries(tools.mcp)) {
            console.log(`    ${server}: ${serverTools.length} tools`);
          }
        }
        console.log();
        break;

      case 'save':
        await this.store.save();
        console.log(c('State saved.', 'green'));
        console.log();
        break;

      case 'load':
        await this.store.load();
        // Restore conversation history
        this.llm.clearHistory();
        const state = this.store.getState();
        for (const msg of state.conversation.history) {
          this.llm.getHistory().push(msg);
        }
        console.log(c(`State loaded. ${state.conversation.history.length} messages restored.`, 'green'));
        console.log();
        break;

      case 'export':
        if (args.length > 0) {
          await this.store.export(args[0]);
          console.log(c(`State exported to: ${args[0]}`, 'green'));
        } else {
          console.log(c('Usage: /export <filename>', 'yellow'));
        }
        console.log();
        break;

      case 'reset':
        this.store.reset();
        this.llm.clearHistory();
        console.log(c('State reset to empty.', 'yellow'));
        console.log();
        break;

      case 'state':
        this.printStateInfo();
        break;

      case 'tools':
        this.enableTools = !this.enableTools;
        console.log(c(`MCP Tools: ${this.enableTools ? 'ENABLED' : 'DISABLED'}`, 'yellow'));
        console.log();
        break;

      case 'toolstatus':
        console.log(c('Tool Status:', 'bold'));
        console.log(`  Enabled:         ${this.enableTools ? c('Yes', 'green') : c('No', 'red')}`);
        console.log(`  Executions:      ${this.toolExecutions}`);
        console.log();
        break;

      // Phase 10: Brain commands
      case 'brain':
        this.enableBrain = !this.enableBrain;
        if (this.enableBrain) {
          this.brain.start();
          console.log(c(`Brain: ${c('ACTIVE', 'green')} (Neural Integration enabled)`, 'bold'));
          console.log(c('  Routes: Memory → LLM → Grounding → Tools → Response', 'dim'));
          console.log(c('  With: φ monitoring, Global Workspace, self-healing', 'dim'));
        } else {
          this.brain.stop();
          console.log(c(`Brain: ${c('OFF', 'yellow')} (Direct LLM mode)`, 'bold'));
        }
        console.log();
        break;

      case 'phi':
        const phi = this.brain.getMetrics().avgPhi;
        const phiBar = this.renderPhiBar(phi);
        console.log(c('Consciousness Level (φ):', 'bold'));
        console.log(`  Current:  ${phi.toFixed(3)}`);
        console.log(`  Level:    ${phiBar}`);
        console.log(`  Ignited:  ${phi > 0.3 ? c('Yes (broadcasting)', 'green') : c('No', 'dim')}`);
        console.log();
        break;

      case 'brainmetrics':
      case 'bm':
        this.printBrainMetrics();
        break;

      case 'brainstatus':
      case 'bs':
        this.printBrainStatus();
        break;

      default:
        console.log(c(`Unknown command: /${cmd}`, 'red'));
        console.log('Type /help for available commands.');
        console.log();
    }
  }

  /**
   * Print banner
   */
  private printBanner(): void {
    console.log(`
${c('╔═══════════════════════════════════════════════════════════════╗', 'cyan')}
${c('║', 'cyan')}  ${c('GENESIS', 'bold')} - Interactive Chat                                ${c('║', 'cyan')}
${c('║', 'cyan')}  ${c('An autopoietic AI system', 'dim')}                                   ${c('║', 'cyan')}
${c('╚═══════════════════════════════════════════════════════════════╝', 'cyan')}
`);
  }

  /**
   * Print help
   */
  private printHelp(): void {
    console.log(c('Commands:', 'bold'));
    console.log('  /help, /h      Show this help');
    console.log('  /clear, /c     Clear conversation history');
    console.log('  /history       Show conversation history');
    console.log('  /status, /s    Show LLM status');
    console.log('  /verbose, /v   Toggle verbose mode');
    console.log('  /system        Show system prompt');
    console.log();
    console.log(c('Tools:', 'bold'));
    console.log('  /tools         Toggle MCP tool execution');
    console.log('  /toolstatus    Show tool execution stats');
    console.log();
    console.log(c('Brain (Phase 10):', 'bold'));
    console.log('  /brain         Toggle Brain integration');
    console.log('  /phi           Show consciousness level (φ)');
    console.log('  /brainstatus   Show brain status');
    console.log('  /brainmetrics  Show detailed brain metrics');
    console.log();
    console.log(c('State:', 'bold'));
    console.log('  /save          Save state to disk');
    console.log('  /load          Load state from disk');
    console.log('  /export <f>    Export state to file');
    console.log('  /reset         Reset state to empty');
    console.log('  /state         Show state info');
    console.log();
    console.log('  /quit, /q      Exit chat (auto-saves)');
    console.log();
  }

  /**
   * Print conversation history
   */
  private printHistory(): void {
    const history = this.llm.getHistory();
    if (history.length === 0) {
      console.log(c('No conversation history.', 'dim'));
    } else {
      console.log(c(`Conversation history (${history.length} messages):`, 'cyan'));
      for (const msg of history) {
        const role = msg.role === 'user' ? c('You:', 'green') : c('Genesis:', 'cyan');
        const content = msg.content.length > 100
          ? msg.content.substring(0, 100) + '...'
          : msg.content;
        console.log(`  ${role} ${content}`);
      }
    }
    console.log();
  }

  /**
   * Print status
   */
  private printStatus(): void {
    const status = this.llm.status();
    const history = this.llm.getHistory();

    console.log(c('Status:', 'bold'));
    console.log(`  Provider:     ${status.provider}`);
    console.log(`  Model:        ${status.model}`);
    console.log(`  Configured:   ${status.configured ? c('Yes', 'green') : c('No', 'red')}`);
    console.log(`  Messages:     ${history.length}`);
    console.log(`  Verbose:      ${this.verbose ? 'ON' : 'OFF'}`);
    console.log(`  MCP Tools:    ${this.enableTools ? c('ON', 'green') : c('OFF', 'yellow')}`);
    console.log(`  Tool Calls:   ${this.toolExecutions}`);
    console.log();

    // Phase 10: Brain status
    const brainMetrics = this.brain.getMetrics();
    console.log(c('Brain (Phase 10):', 'cyan'));
    console.log(`  Mode:         ${this.enableBrain ? c('ACTIVE', 'green') : c('OFF', 'yellow')}`);
    console.log(`  φ Level:      ${brainMetrics.avgPhi.toFixed(3)}`);
    console.log(`  Cycles:       ${brainMetrics.totalCycles}`);
    console.log(`  Mem Reuse:    ${(brainMetrics.memoryReuseRate * 100).toFixed(1)}%`);
    console.log();
  }

  /**
   * Print state info
   */
  private printStateInfo(): void {
    const stats = this.store.stats();
    const state = this.store.getState();

    console.log(c('State Info:', 'bold'));
    console.log(`  Data dir:       ${stats.dataDir}`);
    console.log(`  State exists:   ${stats.stateExists ? c('Yes', 'green') : c('No', 'yellow')}`);
    console.log(`  State size:     ${stats.stateSize} bytes`);
    console.log(`  Backups:        ${stats.backupCount}`);
    console.log(`  Dirty:          ${stats.isDirty ? c('Yes', 'yellow') : 'No'}`);
    console.log(`  Last modified:  ${stats.lastModified}`);
    console.log();
    console.log(c('Memory:', 'cyan'));
    console.log(`  Episodes:       ${state.memory.stats.totalEpisodes}`);
    console.log(`  Facts:          ${state.memory.stats.totalFacts}`);
    console.log(`  Skills:         ${state.memory.stats.totalSkills}`);
    console.log();
    console.log(c('Session:', 'cyan'));
    console.log(`  ID:             ${state.session.id.substring(0, 8)}...`);
    console.log(`  Interactions:   ${state.session.interactions}`);
    console.log(`  Started:        ${state.session.startTime}`);
    console.log();
  }

  // ==========================================================================
  // Phase 10: Brain Integration Helpers
  // ==========================================================================

  /**
   * Render φ (consciousness level) as a visual bar
   */
  private renderPhiBar(phi: number): string {
    const width = 20;
    const filled = Math.round(phi * width);
    const empty = width - filled;
    const bar = '█'.repeat(filled) + '░'.repeat(empty);

    // Color based on level
    if (phi >= 0.7) return c(bar, 'green') + ` (High - Global Workspace active)`;
    if (phi >= 0.3) return c(bar, 'yellow') + ` (Medium - Ignition threshold)`;
    return c(bar, 'dim') + ` (Low - Local processing)`;
  }

  /**
   * Print brain metrics (Phase 10)
   */
  private printBrainMetrics(): void {
    const metrics = this.brain.getMetrics();

    console.log(c('Brain Metrics (Phase 10):', 'bold'));
    console.log();

    console.log(c('Processing:', 'cyan'));
    console.log(`  Total cycles:     ${metrics.totalCycles}`);
    console.log(`  Successful:       ${metrics.successfulCycles}`);
    console.log(`  Failed:           ${metrics.failedCycles}`);
    console.log(`  Avg cycle time:   ${metrics.avgCycleTime.toFixed(0)}ms`);
    console.log();

    console.log(c('Memory (Cognitive Workspace):', 'cyan'));
    console.log(`  Recalls:          ${metrics.memoryRecalls}`);
    console.log(`  Reuse rate:       ${(metrics.memoryReuseRate * 100).toFixed(1)}% ${metrics.memoryReuseRate >= 0.54 ? c('(target: 54-60%)', 'green') : c('(target: 54-60%)', 'yellow')}`);
    console.log(`  Anticipation hits: ${metrics.anticipationHits}`);
    console.log(`  Anticipation miss: ${metrics.anticipationMisses}`);
    console.log();

    console.log(c('Grounding (Epistemic Stack):', 'cyan'));
    console.log(`  Checks:           ${metrics.groundingChecks}`);
    console.log(`  Passes:           ${metrics.groundingPasses}`);
    console.log(`  Failures:         ${metrics.groundingFailures}`);
    console.log(`  Human consults:   ${metrics.humanConsultations}`);
    console.log();

    console.log(c('Tools:', 'cyan'));
    console.log(`  Executions:       ${metrics.toolExecutions}`);
    console.log(`  Successes:        ${metrics.toolSuccesses}`);
    console.log(`  Failures:         ${metrics.toolFailures}`);
    console.log();

    console.log(c('Healing (Darwin-Gödel):', 'cyan'));
    console.log(`  Attempts:         ${metrics.healingAttempts}`);
    console.log(`  Successes:        ${metrics.healingSuccesses}`);
    console.log(`  Failures:         ${metrics.healingFailures}`);
    console.log();

    console.log(c('Consciousness (φ Monitor):', 'cyan'));
    console.log(`  Avg φ:            ${metrics.avgPhi.toFixed(3)}`);
    console.log(`  φ violations:     ${metrics.phiViolations}`);
    console.log(`  Broadcasts:       ${metrics.broadcasts}`);
    console.log();

    // Module transitions
    if (Object.keys(metrics.moduleTransitions).length > 0) {
      console.log(c('Module Transitions:', 'cyan'));
      for (const [transition, count] of Object.entries(metrics.moduleTransitions)) {
        console.log(`  ${transition}: ${count}`);
      }
      console.log();
    }
  }

  /**
   * Print brain status (Phase 10)
   */
  private printBrainStatus(): void {
    const metrics = this.brain.getMetrics();
    const phi = metrics.avgPhi;

    console.log(c('Brain Status (Phase 10 Neural Integration):', 'bold'));
    console.log();

    console.log(c('Mode:', 'cyan'));
    console.log(`  Brain:       ${this.enableBrain ? c('ACTIVE', 'green') : c('OFF', 'yellow')}`);
    console.log(`  Running:     ${this.brain.isRunning() ? c('Yes', 'green') : c('No', 'dim')}`);
    console.log();

    console.log(c('Consciousness:', 'cyan'));
    console.log(`  φ Level:     ${phi.toFixed(3)}`);
    console.log(`  φ Bar:       ${this.renderPhiBar(phi)}`);
    console.log(`  Ignited:     ${phi > 0.3 ? c('Yes', 'green') : c('No', 'dim')}`);
    console.log();

    console.log(c('Performance:', 'cyan'));
    const successRate = metrics.totalCycles > 0
      ? (metrics.successfulCycles / metrics.totalCycles * 100).toFixed(1)
      : '0';
    console.log(`  Cycles:      ${metrics.totalCycles}`);
    console.log(`  Success:     ${successRate}%`);
    console.log(`  Avg time:    ${metrics.avgCycleTime.toFixed(0)}ms`);
    console.log(`  Mem reuse:   ${(metrics.memoryReuseRate * 100).toFixed(1)}%`);
    console.log();

    console.log(c('Modules Connected:', 'cyan'));
    console.log('  ✓ Memory (Cognitive Workspace)');
    console.log('  ✓ LLM (Hybrid Router)');
    console.log('  ✓ Grounding (Epistemic Stack)');
    console.log('  ✓ Tools (Dispatcher)');
    console.log('  ✓ Healing (Darwin-Gödel)');
    console.log('  ✓ Consciousness (φ Monitor)');
    console.log('  ✓ Kernel (Agent Orchestration)');
    console.log();
  }

  /**
   * Stop chat session
   */
  stop(): void {
    this.running = false;

    // Stop brain if running
    if (this.enableBrain) {
      console.log(c('\nStopping brain...', 'dim'));
      this.brain.stop();
    }

    // Save state before exit
    console.log(c('Saving state...', 'dim'));
    this.store.updateConversation(this.llm.getHistory());
    this.store.close();

    console.log(c('Goodbye! Genesis signing off.\n', 'cyan'));
    this.rl?.close();
    process.exit(0);
  }
}

// ============================================================================
// Factory
// ============================================================================

export function createChatSession(options?: ChatOptions): ChatSession {
  return new ChatSession(options);
}

/**
 * Start interactive chat (convenience function)
 */
export async function startChat(options?: ChatOptions): Promise<void> {
  const session = createChatSession(options);
  await session.start();
}
