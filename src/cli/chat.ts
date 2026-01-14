/**
 * Genesis v7.1 - Integrated Chat CLI
 *
 * REPL interface to talk to Genesis using readline.
 * No external dependencies.
 *
 * v7.1 Updates:
 * - Brain AUTO-START by default (Phase 10 always active)
 * - Active Inference integrated into response cycle
 * - Value-JEPA world model connected
 * - Curiosity-driven behavior enabled
 * - Φ monitoring shown in every response
 * - All advanced modules wired together
 *
 * Architecture:
 * ```
 * User Input → Brain → Memory + Active Inference → LLM → Grounding → Tools → Response
 *                ↓
 *          Value-JEPA (curiosity) → Expected Free Energy → Policy Selection
 *                ↓
 *          Φ Monitor → Global Workspace Broadcast
 * ```
 */

import * as readline from 'readline';
import { getLLMBridge, buildSystemPrompt, GENESIS_IDENTITY_PROMPT, LLMBridge } from '../llm/index.js';
import { getStateStore, StateStore, getSessionManager, SessionManager, SessionInfo } from '../persistence/index.js';
import { ToolDispatcher, ToolResult } from './dispatcher.js';
import { getMCPClient, MCP_SERVER_REGISTRY } from '../mcp/index.js';
import { MCPServerName } from '../types.js';
import { Brain, getBrain, BrainMetrics, BrainTrace, createBrainTrace } from '../brain/index.js';
import { getMemorySystem, MemorySystem } from '../memory/index.js';
import { healing } from '../healing/index.js';
import { createSelfProductionEngine, SelfProductionEngine } from '../self-production.js';

// v7.1: Active Inference integration
import {
  createAutonomousLoop,
  AutonomousLoop,
  createValueIntegratedLoop,
  ValueAugmentedEngine,
} from '../active-inference/index.js';

// v7.4: Subagent System
import {
  getSubagentExecutor,
  SubagentExecutor,
  TaskRequest,
  BackgroundTask,
  getSubagentNames,
} from '../subagents/index.js';
// v7.4.5: Hooks System
import {
  getHooksManager,
  HooksManager,
  HookEvent,
  HookContext,
  createSampleHooksConfig,
} from '../hooks/index.js';
import {
  style, c, COLORS,
  success, error, warning, info, muted, highlight,
  Spinner, ThinkingSpinner, ProgressBar,
  formatMarkdown, highlightCode,
  banner, box, table,
  truncate, formatDuration,
  InputHistory,
  // v7.4.4: Extended Thinking visualization
  formatResponseWithThinking,
  ThinkingSettings,
  DEFAULT_THINKING_SETTINGS,
  // v7.6: Enhanced UI components
  StatusLine,
  buildRichPrompt,
  formatToolExecution,
  formatToolSummary,
} from './ui.js';

// ============================================================================
// Chat Session
// ============================================================================

export interface ChatOptions {
  provider?: 'ollama' | 'openai' | 'anthropic';
  model?: string;
  verbose?: boolean;
  enableTools?: boolean;  // Enable MCP tool execution
  enableBrain?: boolean;  // Enable Brain integration (Phase 10) - DEFAULT: true in v7.1
  enableInference?: boolean;  // v7.1: Enable Active Inference loop
  enableCuriosity?: boolean;  // v7.1: Enable curiosity-driven behavior
  // v7.4: Headless mode for scripting/CI-CD
  headless?: boolean;       // If true, run non-interactively (no REPL)
  prompt?: string;          // Prompt to process in headless mode
  outputFormat?: 'text' | 'json';  // Output format for headless mode
  // v7.4: Session management (resume, fork)
  resume?: string | boolean;  // Session ID to resume ('last' or true for most recent)
  sessionName?: string;      // Name for the current session
}

export class ChatSession {
  private llm: LLMBridge;
  private store: StateStore;
  private dispatcher: ToolDispatcher;
  private brain: Brain;  // Phase 10: Brain integration
  private brainTrace: BrainTrace;  // Phase 10: Brain trace visualization
  private rl: readline.Interface | null = null;
  private running = false;
  private verbose: boolean;
  private enableTools: boolean;
  private enableBrain: boolean;  // Phase 10: Brain mode - DEFAULT TRUE in v7.1
  private enableTrace: boolean;  // Phase 10: Brain trace mode
  private enableInference: boolean;  // v7.1: Active Inference mode
  private enableCuriosity: boolean;  // v7.1: Curiosity-driven behavior
  private messageCount = 0;
  private toolExecutions = 0;
  private systemPrompt: string = '';  // Built dynamically at start()
  private customSystemPrompt: string = '';  // User-defined system prompt prefix

  // v7.0: Modern UI components
  private spinner: Spinner;
  private thinkingSpinner: ThinkingSpinner;  // v7.3.8: Shows time, module, action
  private brainEventUnsub: (() => void) | null = null;  // v7.3.8: Brain event cleanup
  private inputHistory: InputHistory;
  private memory: MemorySystem;  // v7.0: Memory system with consolidation
  private selfProduction: SelfProductionEngine;  // v7.0: Darwin-Gödel self-improvement

  // v7.1: Active Inference integration
  private inferenceLoop: AutonomousLoop | null = null;
  private lastCuriosity: number = 0;  // Track curiosity level
  private lastSurprise: number = 0;   // Track surprise from inference

  // v7.4: Subagent System
  private subagentExecutor: SubagentExecutor;

  // v7.4: Background task support
  private isProcessing = false;  // True when processing a message
  private currentTaskAbort: AbortController | null = null;  // For cancelling current task

  // v7.4: Headless mode
  private headlessMode = false;
  private outputFormat: 'text' | 'json' = 'text';

  // v7.4: Session management
  private sessionManager: SessionManager;
  private sessionName: string | undefined;
  private resumeSessionId: string | boolean | undefined;

  // v7.4.4: Extended Thinking visualization
  private thinkingSettings: ThinkingSettings;

  // v7.4.5: Hooks System
  private hooks: HooksManager;

  // v7.6: Enhanced status line
  private statusLine: StatusLine;

  constructor(options: ChatOptions = {}) {
    this.llm = getLLMBridge({
      provider: options.provider,
      model: options.model,
    });
    this.store = getStateStore({ autoSave: true, autoSaveIntervalMs: 60000 });
    this.dispatcher = new ToolDispatcher({ verbose: options.verbose });
    this.brain = getBrain();  // Phase 10: Initialize brain
    this.brainTrace = createBrainTrace(this.brain);  // Phase 10: Initialize trace
    this.memory = getMemorySystem();  // v7.0: Initialize memory with consolidation
    this.selfProduction = createSelfProductionEngine('7.1.0');  // v7.1: Darwin-Gödel
    this.subagentExecutor = getSubagentExecutor();  // v7.4: Subagent system
    this.subagentExecutor.setDispatcher(this.dispatcher);  // v7.4: Wire dispatcher
    this.verbose = options.verbose ?? false;
    this.enableTools = options.enableTools ?? true;  // Enabled by default
    this.enableBrain = options.enableBrain ?? true;  // v7.1: Brain mode ON by default!
    this.enableTrace = false;  // Trace off by default
    this.enableInference = options.enableInference ?? true;  // v7.1: Inference ON by default
    this.enableCuriosity = options.enableCuriosity ?? true;  // v7.1: Curiosity ON by default
    this.headlessMode = options.headless ?? false;  // v7.4: Headless mode
    this.outputFormat = options.outputFormat ?? 'text';  // v7.4: Output format
    this.sessionManager = getSessionManager();  // v7.4: Session manager
    this.sessionName = options.sessionName;  // v7.4: Session name
    this.resumeSessionId = options.resume;  // v7.4: Resume session
    this.thinkingSettings = { ...DEFAULT_THINKING_SETTINGS };  // v7.4.4: Extended thinking
    this.hooks = getHooksManager();  // v7.4.5: Hooks system

    // v7.0: Initialize UI components
    this.spinner = new Spinner('Thinking');
    this.thinkingSpinner = new ThinkingSpinner();  // v7.3.8
    this.inputHistory = new InputHistory(100);
    this.statusLine = new StatusLine();  // v7.6: Real-time status bar

    // v7.3.8: Subscribe to brain events for thinking visualization
    this.brainEventUnsub = this.brain.on((event) => {
      if (!this.thinkingSpinner.isRunning()) return;

      switch (event.type) {
        case 'module_enter':
          this.thinkingSpinner.setModule(event.module || '');
          break;
        case 'memory_recall':
          this.thinkingSpinner.setAction('Recalling context');
          break;
        case 'memory_anticipate':
          this.thinkingSpinner.setAction('Anticipating needs');
          break;
        case 'llm_request':
          this.thinkingSpinner.setAction('Generating response');
          break;
        case 'tool_execute':
          const toolCount = (event.data as { count?: number })?.count || 0;
          this.thinkingSpinner.setAction(`Calling ${toolCount} tool(s)`);
          break;
        case 'grounding_check':
          this.thinkingSpinner.setAction('Verifying facts');
          break;
        case 'healing_start':
          this.thinkingSpinner.setAction('Self-healing');
          break;
        case 'phi_update':
          const phi = (event.data as { phi?: number })?.phi || 0;
          this.thinkingSpinner.setAction(`φ=${phi.toFixed(2)}`);
          break;
      }
    });

    // v7.1: Initialize Active Inference loop
    if (this.enableInference) {
      this.inferenceLoop = createAutonomousLoop({
        cycleInterval: 0,  // No auto-cycling, we trigger manually
        maxCycles: 0,
        verbose: false,
        stopOnGoalAchieved: false,
        stopOnEnergyCritical: true,
      });
    }

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

    // v7.4: Handle session resume
    if (this.resumeSessionId) {
      const sessionId = this.resumeSessionId === true ? 'last' : this.resumeSessionId;
      const resumedState = this.sessionManager.loadSession(sessionId);

      if (resumedState) {
        // Restore conversation history
        const history = resumedState.conversation?.history || [];
        for (const msg of history) {
          this.llm.getHistory().push(msg);
        }
        // Update store with resumed state
        this.store.update(resumedState);

        console.log(success(`✓ Resumed session: ${resumedState.session?.id?.slice(0, 8) || sessionId}`));
        console.log(muted(`  ${history.length} messages, ${resumedState.conversation?.totalTokens || 0} tokens`));
        console.log();
      } else {
        console.log(warning(`Session not found: ${sessionId}`));
        console.log(muted('Starting new session instead.'));
        console.log();
      }
    }

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

    // v7.1: Auto-start Brain (always on by default)
    if (this.enableBrain) {
      this.brain.start();
      console.log(c(`Brain: ${c('ACTIVE', 'green')} (Phase 10 Neural Integration)`, 'dim'));
    } else {
      console.log(c(`Brain: ${c('OFF', 'yellow')} (use /brain to enable)`, 'dim'));
    }

    // v7.1: Show Active Inference status
    if (this.enableInference) {
      console.log(c(`Inference: ${c('ACTIVE', 'green')} (Active Inference + Value-JEPA)`, 'dim'));
    }
    if (this.enableCuriosity) {
      console.log(c(`Curiosity: ${c('ACTIVE', 'green')} (Intrinsic motivation enabled)`, 'dim'));
    }
    console.log();

    // v7.3.6: Pre-warm critical MCP servers in background to avoid cold start timeouts
    this.preWarmMCPServers();

    // v7.4.5: Execute session-start hook
    if (this.hooks.hasHooks()) {
      const hookResult = await this.hooks.execute('session-start', {
        event: 'session-start',
        sessionId: this.store.getState().session?.id,
        workingDir: process.cwd(),
      });
      if (hookResult?.blocked) {
        console.log(error('Session blocked by hook'));
        process.exit(1);
      }
    }

    this.printHelp();

    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    // v7.4: Enable keypress events for shortcuts (Ctrl+B, Ctrl+R, etc.)
    if (process.stdin.isTTY) {
      readline.emitKeypressEvents(process.stdin, this.rl);
      process.stdin.on('keypress', (str, key) => {
        this.handleKeypress(str, key);
      });
    }

    this.running = true;
    await this.chatLoop();
  }

  /**
   * v7.4: Handle keyboard shortcuts
   */
  private handleKeypress(_str: string | undefined, key: readline.Key | undefined): void {
    if (!key) return;

    // Ctrl+B: Background current task
    if (key.ctrl && key.name === 'b') {
      if (this.isProcessing) {
        console.log();
        console.log(warning('⏸ Backgrounding current task...'));
        console.log(c('  Task continues in background. Use /tasks to monitor.', 'dim'));
        console.log();
        // Signal that user wants to background the task
        this.currentTaskAbort?.abort();
      } else {
        console.log(c('\n[Ctrl+B: No task running to background]', 'dim'));
      }
      return;
    }

    // Ctrl+R: Reverse history search (TODO: implement full readline history)
    if (key.ctrl && key.name === 'r') {
      // For now, just show hint - full implementation needs custom readline
      console.log(c('\n[Ctrl+R: History search - use /history for now]', 'dim'));
      return;
    }

    // Ctrl+L: Clear screen (keep conversation)
    if (key.ctrl && key.name === 'l') {
      console.clear();
      this.printBanner();
      console.log(c('Screen cleared. Conversation preserved.', 'dim'));
      console.log();
      return;
    }

    // Ctrl+O: Toggle verbose output
    if (key.ctrl && key.name === 'o') {
      this.verbose = !this.verbose;
      console.log(c(`\n[Verbose: ${this.verbose ? 'ON' : 'OFF'}]`, 'dim'));
      return;
    }
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
   * Prompt for user input (v7.6: with rich prompt and history support)
   */
  private prompt(): Promise<string> {
    return new Promise((resolve) => {
      // v7.6: Build context-aware rich prompt
      const metrics = this.enableBrain ? this.brain.getMetrics() : null;
      const promptStr = buildRichPrompt({
        model: this.llm.getConfig?.()?.model || 'genesis',
        phi: metrics?.avgPhi,
        sessionName: this.sessionName,
        toolsActive: this.enableTools,
      });

      this.rl?.question(promptStr, (answer) => {
        const trimmed = answer.trim();
        // v7.0: Add to history if not empty and not a duplicate
        if (trimmed) {
          this.inputHistory.add(trimmed);
        }
        resolve(trimmed);
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

    // v7.4: Track processing state for Ctrl+B
    this.isProcessing = true;

    // v7.0: Modern spinner instead of static text
    this.spinner.start('Thinking');

    try {
      // Combine custom and base system prompts
      const effectiveSystemPrompt = this.customSystemPrompt
        ? `${this.customSystemPrompt}\n\n${this.systemPrompt}`
        : this.systemPrompt;
      const response = await this.llm.chat(message, effectiveSystemPrompt);
      this.messageCount++;

      // v7.0: Stop spinner and print formatted response
      this.spinner.stop();
      // v7.4.4: Process thinking blocks before display
      const { formatted, hasThinking, thinkingCount } = formatResponseWithThinking(
        response.content,
        this.thinkingSettings.enabled,
        this.thinkingSettings.collapsed
      );
      console.log(c('Genesis: ', 'cyan') + formatted);

      if (this.verbose) {
        console.log(c(`  [${response.latency}ms, ${response.usage?.outputTokens || '?'} tokens]`, 'dim'));
      }

      // Check for tool calls if tools are enabled
      if (this.enableTools) {
        const toolCalls = this.dispatcher.parseToolCalls(response.content);

        if (toolCalls.length > 0) {
          // v7.0: Progress bar for multi-tool execution
          const progress = new ProgressBar(toolCalls.length, info('Tools'));
          console.log();
          progress.update(0);

          const dispatchResult = await this.dispatcher.dispatch(toolCalls);
          this.toolExecutions += toolCalls.length;
          progress.update(toolCalls.length);
          console.log(); // New line after progress

          // Format results for re-injection
          const toolResults = this.formatToolResults(dispatchResult.results);

          // v7.6: Compact tool execution display (Claude Code style)
          for (const result of dispatchResult.results) {
            console.log(formatToolExecution({
              name: result.name,
              status: result.success ? 'success' : 'error',
              result: result.success
                ? truncate(typeof result.data === 'string' ? result.data : JSON.stringify(result.data), 100)
                : result.error,
              duration: result.duration,
            }));
          }
          // Show summary if multiple tools
          if (dispatchResult.results.length > 1) {
            const successCount = dispatchResult.results.filter(r => r.success).length;
            console.log(formatToolSummary({
              total: dispatchResult.results.length,
              successful: successCount,
              failed: dispatchResult.results.length - successCount,
              totalDuration: dispatchResult.totalDuration,
            }));
          }

          // Feed results back to LLM for continued response
          // v7.16: Enhanced prompt with anti-confabulation instructions
          this.spinner.start('Processing results');
          const hasErrors = dispatchResult.results.some(r => !r.success);
          const errorInstruction = hasErrors
            ? '\n\nIMPORTANT: Some tools failed. You MUST report these failures to the user. Do NOT fabricate results for failed tools.'
            : '';
          const followUp = await this.llm.chat(
            `Tool execution results:\n${toolResults}${errorInstruction}\n\nPlease provide a final response based on these results.`
          );

          this.spinner.stop();
          // v7.4.4: Process thinking blocks in follow-up
          const followUpFormatted = formatResponseWithThinking(
            followUp.content,
            this.thinkingSettings.enabled,
            this.thinkingSettings.collapsed
          );
          console.log(c('Genesis: ', 'cyan') + followUpFormatted.formatted);
        }
      }

      // Persist conversation to state
      this.store.updateConversation(this.llm.getHistory(), response.usage?.outputTokens);
      this.store.recordInteraction();

      this.isProcessing = false;  // v7.4: Done processing
      console.log();
    } catch (err) {
      this.isProcessing = false;  // v7.4: Done processing (error)

      // v7.0: Stop spinner on error
      this.spinner.stop();
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.log(error(`Genesis: Error - ${errorMessage}`));
      console.log();
    }
  }

  /**
   * Format tool results for LLM consumption
   * v7.16: Enhanced error formatting to prevent confabulation
   */
  private formatToolResults(results: ToolResult[]): string {
    const formatted = results.map(r => {
      if (r.success) {
        const data = typeof r.data === 'string' ? r.data : JSON.stringify(r.data, null, 2);
        return `[${r.name}] SUCCESS:\n${data}`;
      } else {
        // CRITICAL: Make errors unmistakably clear to prevent confabulation
        return `[${r.name}] ⚠️ TOOL FAILED ⚠️
ERROR: ${r.error}
INSTRUCTION: You MUST report this error to the user. Do NOT fabricate or guess what the result might have been.`;
      }
    }).join('\n\n');

    // Add summary of failures if any
    const failures = results.filter(r => !r.success);
    if (failures.length > 0) {
      const failureSummary = `\n\n---\n⚠️ ${failures.length} TOOL(S) FAILED: ${failures.map(f => f.name).join(', ')}\nYou MUST acknowledge these failures in your response. Do NOT invent outputs for failed tools.`;
      return formatted + failureSummary;
    }

    return formatted;
  }

  /**
   * v7.1: Send message via Brain with Active Inference integration
   *
   * Full pipeline:
   * 1. Active Inference cycle (update beliefs, compute surprise)
   * 2. Curiosity computation (novelty of input)
   * 3. Memory → LLM → Grounding → Tools → Response (via Brain)
   * 4. Φ monitoring and broadcast
   * 5. Value update from outcome
   *
   * Routes through: Memory → LLM → Grounding → Tools → Response
   * With: φ monitoring, Global Workspace broadcasting, self-healing
   */
  private async sendMessageViaBrain(message: string): Promise<void> {
    this.isProcessing = true;  // v7.4: Track processing state for Ctrl+B

    // v7.4.5: Execute pre-message hook
    if (this.hooks.hasHooks()) {
      const hookResult = await this.hooks.execute('pre-message', {
        event: 'pre-message',
        message,
        sessionId: this.store.getState().session?.id,
        workingDir: process.cwd(),
      });
      if (hookResult?.blocked) {
        console.log(warning('Message blocked by hook'));
        this.isProcessing = false;
        return;
      }
    }

    // v7.1: Run Active Inference cycle BEFORE processing
    if (this.enableInference && this.inferenceLoop) {
      try {
        // Run one inference cycle to update beliefs
        const action = await this.inferenceLoop.cycle();
        const stats = this.inferenceLoop.getStats();
        this.lastSurprise = stats.avgSurprise;

        // Compute curiosity based on message novelty
        if (this.enableCuriosity) {
          // Simple heuristic: longer messages with questions = more curious
          const hasQuestion = message.includes('?');
          const wordCount = message.split(/\s+/).length;
          const noveltyKeywords = ['new', 'novel', 'interesting', 'unknown', 'explore', 'discover', 'why', 'how', 'what'];
          const noveltyScore = noveltyKeywords.filter(k => message.toLowerCase().includes(k)).length;
          this.lastCuriosity = Math.min(1, (noveltyScore * 0.15) + (hasQuestion ? 0.2 : 0) + (wordCount > 20 ? 0.1 : 0));
        }
      } catch (err) {
        // Inference failure is non-fatal
        if (this.verbose) {
          console.log(c(`  [Inference: ${err instanceof Error ? err.message : err}]`, 'dim'));
        }
      }
    }

    // v7.3.8: Use ThinkingSpinner for Brain processing (shows time, module, action)
    if (!this.enableTrace) {
      this.thinkingSpinner.start();
    }

    try {
      const response = await this.brain.process(message);
      this.messageCount++;

      // v7.3.8: Stop thinking spinner
      if (!this.enableTrace) {
        this.thinkingSpinner.stop();
      }
      // v7.4.4: Process thinking blocks in brain response
      const brainFormatted = formatResponseWithThinking(
        response,
        this.thinkingSettings.enabled,
        this.thinkingSettings.collapsed
      );
      console.log(c('Genesis: ', 'cyan') + brainFormatted.formatted);

      // v7.1: ALWAYS show Φ and key metrics (not just in verbose mode)
      const metrics = this.brain.getMetrics();
      const phi = metrics.avgPhi;
      const phiIcon = phi >= 0.5 ? '🧠' : phi >= 0.3 ? '💭' : '○';
      const curiosityIcon = this.lastCuriosity >= 0.5 ? '✨' : this.lastCuriosity >= 0.2 ? '?' : '';

      // Compact status line
      const statusParts: string[] = [
        `φ=${phi.toFixed(2)}`,
      ];
      if (this.enableCuriosity && this.lastCuriosity > 0) {
        statusParts.push(`curiosity=${this.lastCuriosity.toFixed(2)}`);
      }
      if (this.enableInference && this.lastSurprise > 0) {
        statusParts.push(`surprise=${this.lastSurprise.toFixed(2)}`);
      }
      console.log(c(`  ${phiIcon} [${statusParts.join(', ')}]${curiosityIcon}`, 'dim'));

      // Show more details in verbose mode
      if (this.verbose) {
        const reuseRate = metrics.memoryReuseRate * 100;
        console.log(c(`  [reuse=${reuseRate.toFixed(0)}%, cycles=${metrics.totalCycles}]`, 'dim'));
      }

      // Persist interaction (Brain manages its own conversation context)
      this.store.recordInteraction();

      // v7.4.5: Execute post-message hook
      if (this.hooks.hasHooks()) {
        this.hooks.execute('post-message', {
          event: 'post-message',
          message,
          response: brainFormatted.formatted,
          sessionId: this.store.getState().session?.id,
          workingDir: process.cwd(),
        });
      }

      this.isProcessing = false;  // v7.4: Done processing
      console.log();
    } catch (err) {
      this.isProcessing = false;  // v7.4: Done processing (error)

      // v7.3.8: Stop thinking spinner on error
      if (!this.enableTrace) {
        this.thinkingSpinner.stop();
      }
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.log(error(`Genesis: Brain error - ${errorMessage}`));

      // Fallback to direct LLM if brain fails
      console.log(warning('  [Falling back to direct LLM...]'));
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
          const subCmd = args[0].toLowerCase();
          if (subCmd === 'clear' || subCmd === 'reset') {
            this.customSystemPrompt = '';
            console.log(c('Custom system prompt cleared.', 'green'));
          } else {
            // Set custom system prompt (everything after /system)
            this.customSystemPrompt = args.join(' ');
            console.log(c('Custom system prompt set:', 'green'));
            console.log(c('─'.repeat(60), 'dim'));
            console.log(this.customSystemPrompt);
            console.log(c('─'.repeat(60), 'dim'));
            console.log(c('Use /system clear to reset.', 'dim'));
          }
        } else {
          // Show current system prompt
          if (this.customSystemPrompt) {
            console.log(c('Custom System Prompt:', 'green'));
            console.log(c('─'.repeat(60), 'dim'));
            console.log(this.customSystemPrompt);
            console.log(c('─'.repeat(60), 'dim'));
            console.log();
          }
          console.log(c('Base System Prompt (dynamically built):', 'cyan'));
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

      case 'mcptest':
      case 'mcp':
        await this.runMCPDiagnostics();
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

      case 'braintrace':
      case 'trace':
      case 'bt':
        this.enableTrace = !this.enableTrace;
        if (this.enableTrace) {
          this.brainTrace.enable();
          console.log(c(`Brain Trace: ${c('ON', 'green')} - Shows internal thinking process`, 'bold'));
          console.log(c('  You will see: memory recalls, LLM requests, grounding checks, etc.', 'dim'));
          if (!this.enableBrain) {
            console.log(c('  Note: Enable /brain for trace to show during chat', 'yellow'));
          }
        } else {
          this.brainTrace.disable();
          console.log(c(`Brain Trace: ${c('OFF', 'yellow')}`, 'bold'));
        }
        console.log();
        break;

      // v7.0: Memory commands
      case 'memory':
      case 'mem':
        this.printMemoryStatus();
        break;

      case 'remember':
        if (args.length > 0) {
          const factText = args.join(' ');
          this.memory.learn({
            concept: 'user-fact',
            definition: factText,
            properties: { source: 'user-input', timestamp: new Date() },
            category: 'user-facts',
            sources: ['chat-input'],
            importance: 0.7,
            tags: ['user', 'remembered'],
          });
          console.log(success(`✓ Remembered: "${factText}"`));
        } else {
          console.log(warning('Usage: /remember <text to remember>'));
        }
        console.log();
        break;

      case 'forget':
        // Requires confirmation
        console.log(warning('This will clear all memories. Use /forget confirm to proceed.'));
        if (args[0] === 'confirm') {
          this.memory.shutdown();
          console.log(success('✓ Memory cleared.'));
        }
        console.log();
        break;

      case 'consolidate':
        console.log(info('Running memory consolidation...'));
        this.memory.consolidation.backgroundConsolidate().then(result => {
          console.log(success(`✓ Consolidation complete:`));
          console.log(`  Episodic processed: ${result.episodicProcessed}`);
          console.log(`  Semantic created:   ${result.semanticCreated}`);
          console.log(`  Procedural updated: ${result.proceduralUpdated}`);
          console.log(`  Forgotten:          ${result.forgotten}`);
          console.log(`  Duration:           ${formatDuration(result.duration)}`);
        }).catch(err => {
          console.log(error(`Consolidation error: ${err instanceof Error ? err.message : err}`));
        });
        break;

      // v7.0: Darwin-Gödel self-improvement commands
      case 'heal':
        this.printHealingStatus();
        break;

      case 'analyze':
        this.runSelfAnalysis();
        break;

      case 'improve':
        if (args[0] === 'confirm') {
          this.runSelfImprovement();
        } else {
          console.log(warning('This will trigger self-improvement. Use /improve confirm to proceed.'));
          console.log(muted('  Safety: Git commit created before any changes'));
        }
        console.log();
        break;

      // v7.1: Active Inference commands
      case 'inference':
      case 'infer':
        this.enableInference = !this.enableInference;
        if (this.enableInference) {
          if (!this.inferenceLoop) {
            this.inferenceLoop = createAutonomousLoop({
              cycleInterval: 0,
              maxCycles: 0,
              verbose: false,
              stopOnGoalAchieved: false,
              stopOnEnergyCritical: true,
            });
          }
          console.log(c(`Inference: ${c('ACTIVE', 'green')} (Active Inference + Value-JEPA)`, 'bold'));
          console.log(c('  Runs inference cycle before each response', 'dim'));
          console.log(c('  Computes: beliefs, surprise, Expected Free Energy', 'dim'));
        } else {
          console.log(c(`Inference: ${c('OFF', 'yellow')}`, 'bold'));
        }
        console.log();
        break;

      case 'curiosity':
        this.enableCuriosity = !this.enableCuriosity;
        if (this.enableCuriosity) {
          console.log(c(`Curiosity: ${c('ACTIVE', 'green')} (Intrinsic motivation)`, 'bold'));
          console.log(c('  Computes novelty score for each message', 'dim'));
          console.log(c('  Higher curiosity → more exploratory responses', 'dim'));
        } else {
          console.log(c(`Curiosity: ${c('OFF', 'yellow')}`, 'bold'));
        }
        console.log();
        break;

      case 'beliefs':
        this.printBeliefs();
        break;

      // v7.4: Subagent commands
      case 'task':
        await this.runSubagentTask(args);
        break;

      case 'tasks':
        this.printRunningTasks();
        break;

      case 'taskwait':
        if (args[0]) {
          await this.waitForTask(args[0]);
        } else {
          console.log(warning('Usage: /taskwait <taskId>'));
        }
        break;

      case 'taskcancel':
        if (args[0]) {
          const cancelled = this.subagentExecutor.cancelTask(args[0]);
          if (cancelled) {
            console.log(success(`✓ Task ${args[0]} cancelled`));
          } else {
            console.log(error(`Task ${args[0]} not found or not running`));
          }
        } else {
          console.log(warning('Usage: /taskcancel <taskId>'));
        }
        console.log();
        break;

      case 'agents':
        this.printAvailableAgents();
        break;

      // v7.4: Session management commands
      case 'sessions':
        this.printSessions();
        break;

      case 'session':
        if (args[0] === 'name' && args[1]) {
          this.sessionName = args.slice(1).join(' ');
          console.log(success(`Session named: ${this.sessionName}`));
        } else if (args[0] === 'save') {
          const state = this.store.getState();
          this.store.updateConversation(this.llm.getHistory());
          const name = args.slice(1).join(' ') || this.sessionName;
          const id = this.sessionManager.saveSession(this.store.getState(), name);
          console.log(success(`Session saved: ${id.slice(0, 8)}${name ? ` (${name})` : ''}`));
        } else if (args[0] === 'fork') {
          const currentState = this.store.getState();
          this.store.updateConversation(this.llm.getHistory());
          const name = args.slice(1).join(' ') || `Fork at ${new Date().toLocaleTimeString()}`;
          const id = this.sessionManager.saveSession(this.store.getState(), name);
          // Create new session ID for current session
          this.store.newSession();
          console.log(success(`Session forked: ${id.slice(0, 8)}`));
          console.log(muted('Continuing in new session.'));
        } else if (args[0] === 'delete' && args[1]) {
          const deleted = this.sessionManager.deleteSession(args[1]);
          if (deleted) {
            console.log(success(`Session deleted: ${args[1]}`));
          } else {
            console.log(error(`Session not found: ${args[1]}`));
          }
        } else {
          console.log(info('Session commands:'));
          console.log('  /session name <name>   - Name current session');
          console.log('  /session save [name]   - Save session checkpoint');
          console.log('  /session fork [name]   - Fork session (save and start new)');
          console.log('  /session delete <id>   - Delete a saved session');
          console.log('  /sessions              - List all sessions');
        }
        console.log();
        break;

      // v7.4.5: Hooks System
      case 'hooks':
        if (args[0] === 'init') {
          const targetPath = args[1] || '.genesis-hooks.json';
          try {
            createSampleHooksConfig(targetPath);
            console.log(success(`✓ Created sample hooks config: ${targetPath}`));
          } catch (err) {
            console.log(error(`Failed to create hooks config: ${err}`));
          }
        } else if (args[0] === 'reload') {
          this.hooks.reload();
          console.log(success('✓ Hooks configuration reloaded'));
        } else if (args[0] === 'on') {
          this.hooks.setEnabled(true);
          console.log(success('✓ Hooks enabled'));
        } else if (args[0] === 'off') {
          this.hooks.setEnabled(false);
          console.log(warning('Hooks disabled'));
        } else {
          // Show hooks status
          const hasHooks = this.hooks.hasHooks();
          const configPath = this.hooks.getConfigPath();
          const configured = this.hooks.getConfiguredHooks();

          console.log(c('Hooks System (v7.4.5):', 'bold'));
          console.log(`  Status:     ${hasHooks ? c('Active', 'green') : c('No hooks configured', 'yellow')}`);
          if (configPath) {
            console.log(`  Config:     ${configPath}`);
          }
          if (configured.length > 0) {
            console.log(`  Configured: ${configured.join(', ')}`);
          }
          console.log();
          console.log(muted('Commands:'));
          console.log(muted('  /hooks init [path]  - Create sample hooks config'));
          console.log(muted('  /hooks reload       - Reload hooks configuration'));
          console.log(muted('  /hooks on/off       - Enable/disable hooks'));
          console.log();
          console.log(muted('Events: session-start, session-end, pre-message, post-message,'));
          console.log(muted('        pre-tool, post-tool, pre-subagent, post-subagent, error'));
        }
        console.log();
        break;

      // v7.4.4: Extended Thinking visualization
      case 'thinking':
      case 'think':
        if (args[0] === 'on') {
          this.thinkingSettings.enabled = true;
          this.thinkingSettings.collapsed = false;
          console.log(c(`Extended Thinking: ${c('ON', 'green')} (expanded view)`, 'bold'));
        } else if (args[0] === 'off') {
          this.thinkingSettings.enabled = false;
          console.log(c(`Extended Thinking: ${c('OFF', 'yellow')}`, 'bold'));
        } else if (args[0] === 'collapsed' || args[0] === 'compact') {
          this.thinkingSettings.enabled = true;
          this.thinkingSettings.collapsed = true;
          console.log(c(`Extended Thinking: ${c('ON', 'green')} (collapsed view)`, 'bold'));
        } else if (args[0] === 'expanded' || args[0] === 'full') {
          this.thinkingSettings.enabled = true;
          this.thinkingSettings.collapsed = false;
          console.log(c(`Extended Thinking: ${c('ON', 'green')} (expanded view)`, 'bold'));
        } else {
          // Toggle or show status
          if (!args[0]) {
            this.thinkingSettings.enabled = !this.thinkingSettings.enabled;
          }
          const status = this.thinkingSettings.enabled ? c('ON', 'green') : c('OFF', 'yellow');
          const mode = this.thinkingSettings.collapsed ? 'collapsed' : 'expanded';
          console.log(c(`Extended Thinking: ${status} (${mode} view)`, 'bold'));
          console.log(muted('  Shows model reasoning in <think>...</think> blocks'));
          console.log(muted('  Commands:'));
          console.log(muted('    /thinking on         - Enable (expanded)'));
          console.log(muted('    /thinking off        - Disable'));
          console.log(muted('    /thinking collapsed  - Enable (one-line preview)'));
          console.log(muted('    /thinking expanded   - Enable (full view)'));
        }
        console.log();
        break;

      default:
        console.log(c(`Unknown command: /${cmd}`, 'red'));
        console.log('Type /help for available commands.');
        console.log();
    }
  }

  /**
   * Print banner (v7.0: Uses modern UI component)
   */
  private printBanner(): void {
    banner('GENESIS - System Creator', 'Powered by 17 MCP Servers');
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
    console.log('  /braintrace    Toggle visible thinking trace');
    console.log('  /phi           Show consciousness level (φ)');
    console.log('  /brainstatus   Show brain status');
    console.log('  /brainmetrics  Show detailed brain metrics');
    console.log();
    console.log(c('Active Inference (v7.1):', 'bold'));
    console.log('  /inference     Toggle Active Inference loop');
    console.log('  /curiosity     Toggle curiosity-driven behavior');
    console.log('  /beliefs       Show current beliefs (viability, world, coupling, goal)');
    console.log();
    console.log(c('Memory (v7.0):', 'bold'));
    console.log('  /memory        Show memory status');
    console.log('  /remember <t>  Store a fact in memory');
    console.log('  /consolidate   Run memory consolidation');
    console.log('  /forget        Clear all memory (confirm)');
    console.log();
    console.log(c('Darwin-Gödel (v7.0):', 'bold'));
    console.log('  /heal          Show self-healing status');
    console.log('  /analyze       Run self-analysis');
    console.log('  /improve       Trigger self-improvement (confirm)');
    console.log();
    console.log(c('Subagents (v7.4):', 'bold'));
    console.log('  /task <t> <p>  Run subagent task (explore, plan, code, research, general)');
    console.log('  /tasks         List running background tasks');
    console.log('  /taskwait <id> Wait for task completion');
    console.log('  /taskcancel <id> Cancel running task');
    console.log('  /agents        Show available subagents');
    console.log();
    console.log(c('Sessions (v7.4):', 'bold'));
    console.log('  /sessions      List saved sessions');
    console.log('  /session name <n>  Name current session');
    console.log('  /session save      Save session checkpoint');
    console.log('  /session fork      Fork session (save & continue new)');
    console.log();
    console.log(c('Extended Thinking (v7.4.4):', 'bold'));
    console.log('  /thinking      Toggle thinking block visibility');
    console.log('  /thinking on   Show thinking blocks (expanded)');
    console.log('  /thinking off  Hide thinking blocks');
    console.log('  /thinking collapsed  Show thinking (one-line)');
    console.log();
    console.log(c('Hooks (v7.4.5):', 'bold'));
    console.log('  /hooks         Show hooks status');
    console.log('  /hooks init    Create sample hooks config');
    console.log('  /hooks reload  Reload hooks configuration');
    console.log('  /hooks on/off  Enable/disable hooks');
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
    console.log(c('Keyboard Shortcuts (v7.4):', 'bold'));
    console.log('  Ctrl+B         Background current task');
    console.log('  Ctrl+L         Clear screen (keep conversation)');
    console.log('  Ctrl+O         Toggle verbose output');
    console.log('  Ctrl+R         History search hint');
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

    // v7.1: Active Inference status
    console.log(c('Active Inference (v7.1):', 'cyan'));
    console.log(`  Inference:    ${this.enableInference ? c('ACTIVE', 'green') : c('OFF', 'yellow')}`);
    console.log(`  Curiosity:    ${this.enableCuriosity ? c('ACTIVE', 'green') : c('OFF', 'yellow')}`);
    if (this.inferenceLoop) {
      const stats = this.inferenceLoop.getStats();
      const beliefs = this.inferenceLoop.getMostLikelyState();
      console.log(`  Viability:    ${beliefs.viability}`);
      console.log(`  World State:  ${beliefs.worldState}`);
      console.log(`  Surprise:     ${stats.avgSurprise.toFixed(3)}`);
      console.log(`  Last Curiosity: ${this.lastCuriosity.toFixed(3)}`);
    }
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
   * v7.1: Print current beliefs from Active Inference
   */
  private printBeliefs(): void {
    console.log(c('Active Inference Beliefs (v7.1):', 'bold'));
    console.log();

    if (!this.inferenceLoop) {
      console.log(warning('Active Inference not initialized.'));
      console.log(muted('Use /inference to enable.'));
      console.log();
      return;
    }

    const beliefs = this.inferenceLoop.getMostLikelyState();
    const stats = this.inferenceLoop.getStats();

    // Viability bar
    const viabilityMap: Record<string, number> = { 'critical': 0.1, 'low': 0.3, 'medium': 0.5, 'high': 0.7, 'optimal': 0.9 };
    const viabilityValue = viabilityMap[beliefs.viability] || 0.5;
    const viabilityBar = this.renderBar(viabilityValue, 15);

    console.log(c('Current State:', 'cyan'));
    console.log(`  Viability:     ${viabilityBar} ${beliefs.viability}`);
    console.log(`  World State:   ${beliefs.worldState}`);
    console.log(`  Coupling:      ${beliefs.coupling}`);
    console.log(`  Goal Progress: ${beliefs.goalProgress}`);
    console.log();

    console.log(c('Inference Stats:', 'cyan'));
    console.log(`  Cycles:        ${stats.cycles}`);
    console.log(`  Avg Surprise:  ${stats.avgSurprise.toFixed(4)}`);
    console.log(`  Last Curiosity: ${this.lastCuriosity.toFixed(4)}`);
    console.log();

    console.log(c('Actions Taken:', 'cyan'));
    for (const [action, count] of Object.entries(stats.actions)) {
      const pct = stats.cycles > 0 ? ((count as number) / stats.cycles * 100).toFixed(1) : '0';
      console.log(`    ${action}: ${count} (${pct}%)`);
    }
    console.log();
  }

  // ============================================================================
  // v7.4: Subagent Commands
  // ============================================================================

  /**
   * Run a subagent task
   */
  private async runSubagentTask(args: string[]): Promise<void> {
    if (args.length < 2) {
      console.log(c('Usage: /task <type> <prompt>', 'yellow'));
      console.log(c('  Types: explore, plan, code, research, general', 'dim'));
      console.log(c('  Example: /task explore Find all authentication handlers', 'dim'));
      console.log(c('  Add --bg at end to run in background', 'dim'));
      console.log();
      return;
    }

    const subagentType = args[0];
    const availableTypes = getSubagentNames();
    if (!availableTypes.includes(subagentType)) {
      console.log(error(`Unknown agent type: ${subagentType}`));
      console.log(c(`Available: ${availableTypes.join(', ')}`, 'dim'));
      console.log();
      return;
    }

    // Check for background flag
    const isBackground = args[args.length - 1] === '--bg';
    const promptArgs = isBackground ? args.slice(1, -1) : args.slice(1);
    const prompt = promptArgs.join(' ');

    const request: TaskRequest = {
      description: prompt.slice(0, 30) + (prompt.length > 30 ? '...' : ''),
      prompt,
      subagentType,
      runInBackground: isBackground,
    };

    if (isBackground) {
      // Background execution
      try {
        const taskId = await this.subagentExecutor.executeBackground(request);
        console.log(success(`✓ Task ${taskId} started in background`));
        console.log(c(`  Agent: ${subagentType}`, 'dim'));
        console.log(c(`  Use /tasks to see status, /taskwait ${taskId} to wait`, 'dim'));
      } catch (err) {
        console.log(error(`Failed to start task: ${err instanceof Error ? err.message : err}`));
      }
    } else {
      // Foreground execution with spinner
      this.thinkingSpinner.start();
      this.thinkingSpinner.setModule(subagentType);
      this.thinkingSpinner.setAction('Running task');

      try {
        const result = await this.subagentExecutor.execute(request);
        this.thinkingSpinner.stop();

        if (result.success) {
          console.log(success(`✓ Task completed in ${formatDuration(result.duration)}`));
          console.log();
          console.log(formatMarkdown(result.result || 'No output'));
        } else {
          console.log(error(`Task failed: ${result.error}`));
        }
      } catch (err) {
        this.thinkingSpinner.stop();
        console.log(error(`Task error: ${err instanceof Error ? err.message : err}`));
      }
    }
    console.log();
  }

  /**
   * Print running tasks
   */
  private printRunningTasks(): void {
    const tasks = this.subagentExecutor.getTasks();

    console.log(c('Background Tasks (v7.4):', 'bold'));
    console.log();

    if (tasks.length === 0) {
      console.log(muted('No tasks running.'));
      console.log();
      return;
    }

    const taskData = tasks.map(t => {
      const statusColor = t.status === 'completed' ? 'green' :
                         t.status === 'running' ? 'cyan' :
                         t.status === 'failed' ? 'red' : 'yellow';
      const duration = t.endTime
        ? formatDuration(t.endTime - t.startTime)
        : formatDuration(Date.now() - t.startTime);

      return {
        id: t.taskId,
        status: c(t.status, statusColor),
        agent: t.subagentType,
        description: truncate(t.description, 30),
        duration,
      };
    });

    console.log(table(taskData, [
      { header: 'ID', key: 'id' },
      { header: 'Status', key: 'status' },
      { header: 'Agent', key: 'agent' },
      { header: 'Description', key: 'description' },
      { header: 'Duration', key: 'duration', align: 'right' },
    ]));
    console.log();
  }

  /**
   * Wait for a task to complete
   */
  private async waitForTask(taskId: string): Promise<void> {
    console.log(info(`Waiting for task ${taskId}...`));

    try {
      const result = await this.subagentExecutor.waitForTask(taskId);

      if (result.success) {
        console.log(success(`✓ Task completed in ${formatDuration(result.duration)}`));
        console.log();
        console.log(formatMarkdown(result.result || 'No output'));
      } else {
        console.log(error(`Task failed: ${result.error}`));
      }
    } catch (err) {
      console.log(error(`Error: ${err instanceof Error ? err.message : err}`));
    }
    console.log();
  }

  /**
   * Print available agents
   */
  private printAvailableAgents(): void {
    console.log(c('Available Subagents (v7.4):', 'bold'));
    console.log();

    const agentData = [
      { agent: 'explore', desc: 'Fast codebase exploration', caps: 'read-only, fast searches', model: 'fast' },
      { agent: 'plan', desc: 'Architecture planning', caps: 'design strategies, no code changes', model: 'powerful' },
      { agent: 'code', desc: 'Code generation', caps: 'write and modify code', model: 'balanced' },
      { agent: 'research', desc: 'Web/paper research', caps: 'external sources, citations', model: 'balanced' },
      { agent: 'general', desc: 'General-purpose', caps: 'complex multi-step tasks', model: 'powerful' },
    ];

    console.log(table(agentData, [
      { header: 'Agent', key: 'agent' },
      { header: 'Description', key: 'desc' },
      { header: 'Capabilities', key: 'caps' },
      { header: 'Model', key: 'model' },
    ]));

    console.log();
    console.log(c('Usage:', 'cyan'));
    console.log(c('  /task <agent> <prompt>         Run task in foreground', 'dim'));
    console.log(c('  /task <agent> <prompt> --bg    Run task in background', 'dim'));
    console.log(c('  /tasks                         List running tasks', 'dim'));
    console.log(c('  /taskwait <id>                 Wait for task completion', 'dim'));
    console.log(c('  /taskcancel <id>               Cancel running task', 'dim'));
    console.log();
  }

  /**
   * v7.4: Print saved sessions
   */
  private printSessions(): void {
    const sessions = this.sessionManager.listSessions();

    if (sessions.length === 0) {
      console.log(muted('No saved sessions.'));
      console.log(muted('Use /session save to save the current session.'));
      console.log();
      return;
    }

    console.log(c('Saved Sessions (v7.4):', 'bold'));
    console.log();

    const sessionData = sessions.slice(0, 10).map(s => ({
      id: s.id.slice(0, 8),
      name: s.name || '-',
      messages: s.messageCount.toString(),
      tokens: s.tokenCount.toString(),
      modified: new Date(s.lastModified).toLocaleString(),
      summary: truncate(s.summary || '', 40),
    }));

    console.log(table(sessionData, [
      { header: 'ID', key: 'id' },
      { header: 'Name', key: 'name' },
      { header: 'Msgs', key: 'messages' },
      { header: 'Tokens', key: 'tokens' },
      { header: 'Modified', key: 'modified' },
      { header: 'Summary', key: 'summary' },
    ]));

    if (sessions.length > 10) {
      console.log(muted(`... and ${sessions.length - 10} more sessions`));
    }

    console.log();
    console.log(c('Usage:', 'cyan'));
    console.log(c('  genesis chat --resume          Resume last session', 'dim'));
    console.log(c('  genesis chat --resume <id>     Resume specific session', 'dim'));
    console.log(c('  /session fork                  Fork current session', 'dim'));
    console.log(c('  /session delete <id>           Delete a session', 'dim'));
    console.log();
  }

  /**
   * Render a simple bar
   */
  private renderBar(value: number, width: number): string {
    const filled = Math.round(value * width);
    const empty = width - filled;
    const bar = '█'.repeat(filled) + '░'.repeat(empty);
    if (value >= 0.7) return c(bar, 'green');
    if (value >= 0.3) return c(bar, 'yellow');
    return c(bar, 'red');
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
   * Print memory status (v7.0)
   */
  private printMemoryStatus(): void {
    const stats = this.memory.getStats();
    const consolidationStats = this.memory.consolidation.getStats();

    console.log(c('Memory Status (v7.0):', 'bold'));
    console.log();

    console.log(c('Stores:', 'cyan'));
    console.log(`  Episodic:    ${stats.episodic.total} memories`);
    console.log(`  Semantic:    ${stats.semantic.total} facts`);
    console.log(`  Procedural:  ${stats.procedural.total} skills`);
    console.log();

    console.log(c('Consolidation:', 'cyan'));
    console.log(`  Background:  ${consolidationStats.backgroundRunning ? success('RUNNING') : muted('STOPPED')}`);
    console.log(`  Last run:    ${consolidationStats.lastConsolidation?.toLocaleString() || muted('Never')}`);
    console.log(`  Total runs:  ${consolidationStats.totalConsolidations}`);
    console.log();

    console.log(c('Forgetting (Ebbinghaus):', 'cyan'));
    console.log(`  Episodic weak:       ${consolidationStats.memoryStats.episodic.weak}/${consolidationStats.memoryStats.episodic.total}`);
    console.log(`  Semantic weak:       ${consolidationStats.memoryStats.semantic.weak}/${consolidationStats.memoryStats.semantic.total}`);
    console.log(`  Procedural weak:     ${consolidationStats.memoryStats.procedural.weak}/${consolidationStats.memoryStats.procedural.total}`);
    console.log();

    console.log(c('Commands:', 'dim'));
    console.log(muted('  /remember <text>   Add a fact to memory'));
    console.log(muted('  /consolidate       Run consolidation now'));
    console.log(muted('  /forget confirm    Clear all memory'));
    console.log();
  }

  /**
   * Print healing status (v7.0 Darwin-Gödel)
   */
  private printHealingStatus(): void {
    const brainMetrics = this.brain.getMetrics();

    console.log(c('Darwin-Gödel Self-Healing (v7.0):', 'bold'));
    console.log();

    console.log(c('Healing Status:', 'cyan'));
    console.log(`  Enabled:           ${success('YES')}`);
    console.log(`  Auto-heal:         ${success('YES')}`);
    console.log(`  Max attempts:      3`);
    console.log();

    console.log(c('Metrics:', 'cyan'));
    console.log(`  Attempts:          ${brainMetrics.healingAttempts}`);
    console.log(`  Successes:         ${brainMetrics.healingSuccesses}`);
    console.log(`  Failures:          ${brainMetrics.healingFailures}`);
    console.log();

    console.log(c('Error Detector:', 'cyan'));
    const detector = healing.getDetector();
    console.log(`  Patterns:          TypeScript, Python, Bash, Generic`);
    console.log(`  Categories:        syntax, type, runtime, dependency, config, network`);
    console.log();

    console.log(c('Auto-Fixer:', 'cyan'));
    const fixer = healing.getFixer();
    const config = fixer.getConfig();
    console.log(`  Max candidates:    ${config.maxCandidates}`);
    console.log(`  Max iterations:    ${config.maxIterations}`);
    console.log(`  Working dir:       ${config.workingDirectory}`);
    console.log();
  }

  /**
   * Run self-analysis (v7.0 Darwin-Gödel)
   */
  private runSelfAnalysis(): void {
    console.log(c('Darwin-Gödel Self-Analysis (v7.0):', 'bold'));
    console.log();

    // Collect metrics
    const brainMetrics = this.brain.getMetrics();
    const memoryStats = this.memory.getStats();

    // Calculate system health
    const successRate = brainMetrics.totalCycles > 0
      ? brainMetrics.successfulCycles / brainMetrics.totalCycles
      : 1;
    const errorRate = brainMetrics.totalCycles > 0
      ? brainMetrics.failedCycles / brainMetrics.totalCycles
      : 0;

    // Analyze for improvements
    const improvements = this.selfProduction.analyzeForImprovements({
      avgPipelineDuration: brainMetrics.avgCycleTime,
      errorRate,
      systemsCreated: this.messageCount,
      cacheHitRate: brainMetrics.memoryReuseRate,
      hasAdvancedTemplates: false,
    });

    console.log(c('System Health:', 'cyan'));
    const healthBar = this.renderHealthBar(successRate);
    console.log(`  Success rate:      ${healthBar} ${(successRate * 100).toFixed(1)}%`);
    console.log(`  Error rate:        ${(errorRate * 100).toFixed(1)}%`);
    console.log(`  Avg cycle time:    ${brainMetrics.avgCycleTime.toFixed(0)}ms`);
    console.log(`  Memory reuse:      ${(brainMetrics.memoryReuseRate * 100).toFixed(1)}%`);
    console.log();

    console.log(c('Self-Production:', 'cyan'));
    console.log(`  Current version:   ${this.selfProduction.getVersion()}`);
    console.log(`  History:           ${this.selfProduction.getHistory().length} productions`);
    console.log();

    if (improvements.length > 0) {
      console.log(c('Suggested Improvements:', 'yellow'));
      for (const imp of improvements) {
        const priorityColor = imp.priority === 'critical' ? 'red' : imp.priority === 'high' ? 'yellow' : 'dim';
        console.log(`  [${c(imp.priority.toUpperCase(), priorityColor)}] ${imp.description}`);
        console.log(muted(`    Type: ${imp.type}, Impact: ${(imp.estimatedImpact * 100).toFixed(0)}%`));
      }
    } else {
      console.log(c('No improvements needed. System is healthy!', 'green'));
    }
    console.log();
  }

  /**
   * Render health bar
   */
  private renderHealthBar(health: number): string {
    const width = 15;
    const filled = Math.round(health * width);
    const empty = width - filled;
    const bar = '█'.repeat(filled) + '░'.repeat(empty);

    if (health >= 0.9) return c(bar, 'green');
    if (health >= 0.7) return c(bar, 'yellow');
    return c(bar, 'red');
  }

  /**
   * Run self-improvement (v7.0 Darwin-Gödel)
   */
  private async runSelfImprovement(): Promise<void> {
    console.log(c('Darwin-Gödel Self-Improvement (v7.0):', 'bold'));
    console.log();

    // First, run analysis
    const brainMetrics = this.brain.getMetrics();
    const errorRate = brainMetrics.totalCycles > 0
      ? brainMetrics.failedCycles / brainMetrics.totalCycles
      : 0;

    const improvements = this.selfProduction.analyzeForImprovements({
      avgPipelineDuration: brainMetrics.avgCycleTime,
      errorRate,
      systemsCreated: this.messageCount,
      cacheHitRate: brainMetrics.memoryReuseRate,
      hasAdvancedTemplates: false,
    });

    if (improvements.length === 0) {
      console.log(success('✓ No improvements needed. System is already optimal.'));
      return;
    }

    console.log(info(`Found ${improvements.length} potential improvements.`));

    // Filter to high priority
    const highPriority = improvements.filter(i => i.priority === 'critical' || i.priority === 'high');
    if (highPriority.length === 0) {
      console.log(muted('No critical or high priority improvements. Skipping.'));
      return;
    }

    console.log(warning('Self-improvement would modify the system. This is currently simulated.'));
    console.log(muted('In a real scenario, the following steps would occur:'));
    console.log(muted('  1. Git commit created as safety checkpoint'));
    console.log(muted('  2. Code modifications generated by LLM'));
    console.log(muted('  3. Tests run to validate changes'));
    console.log(muted('  4. On failure: git revert to checkpoint'));
    console.log(muted('  5. On success: new version tagged'));
    console.log();

    // Simulate the production
    const spec = {
      currentVersion: this.selfProduction.getVersion(),
      targetVersion: '7.0.1',
      improvements: highPriority,
      preserveInvariants: this.selfProduction.getInvariants(),
    };

    console.log(info('Simulating production...'));
    const result = await this.selfProduction.produce(spec);

    if (result.success) {
      console.log(success(`✓ Self-improvement successful! New version: ${result.newVersion}`));
    } else {
      console.log(warning('Self-improvement simulation completed (no actual changes made).'));
    }
    console.log();
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
   * v7.3.6: Run MCP Diagnostics - test all MCP servers and show status
   */
  private async runMCPDiagnostics(): Promise<void> {
    console.log(c('MCP Server Diagnostics:', 'bold'));
    console.log();

    const client = getMCPClient();
    const servers = Object.keys(MCP_SERVER_REGISTRY) as MCPServerName[];

    // Check required API keys
    const requiredKeys: Record<string, string[]> = {
      'wolfram': ['WOLFRAM_APP_ID'],
      'brave-search': ['BRAVE_API_KEY'],
      'exa': ['EXA_API_KEY'],
      'firecrawl': ['FIRECRAWL_API_KEY'],
      'openai': ['OPENAI_API_KEY'],
      'github': ['GITHUB_PERSONAL_ACCESS_TOKEN', 'GITHUB_TOKEN'],
      'stability-ai': ['STABILITY_AI_API_KEY'],
      'gemini': ['GOOGLE_API_KEY', 'GEMINI_API_KEY'],
    };

    const results: Array<{ server: string; status: 'ok' | 'error' | 'no-key'; tools: number; message?: string }> = [];

    console.log(info('Testing MCP servers...'));
    console.log();

    for (const server of servers) {
      process.stdout.write(`  ${server}: `);

      // Check API keys first
      const keys = requiredKeys[server];
      if (keys) {
        const hasKey = keys.some(k => !!process.env[k]);
        if (!hasKey) {
          console.log(warning(`MISSING API KEY (${keys.join(' or ')})`));
          results.push({ server, status: 'no-key', tools: 0, message: `Missing: ${keys.join(' or ')}` });
          continue;
        }
      }

      // Try to connect and list tools
      try {
        const available = await client.isAvailable(server);
        if (available) {
          const tools = await client.listTools(server);
          console.log(success(`✓ OK (${tools.length} tools)`));
          results.push({ server, status: 'ok', tools: tools.length });
        } else {
          console.log(error('✗ NOT AVAILABLE'));
          results.push({ server, status: 'error', tools: 0, message: 'Connection failed' });
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.log(error(`✗ ERROR: ${msg.slice(0, 50)}`));
        results.push({ server, status: 'error', tools: 0, message: msg });
      }
    }

    console.log();

    // Summary
    const okCount = results.filter(r => r.status === 'ok').length;
    const errorCount = results.filter(r => r.status === 'error').length;
    const noKeyCount = results.filter(r => r.status === 'no-key').length;
    const totalTools = results.reduce((sum, r) => sum + r.tools, 0);

    console.log(c('Summary:', 'cyan'));
    console.log(`  Servers OK:       ${success(String(okCount))}/${servers.length}`);
    console.log(`  Servers Error:    ${errorCount > 0 ? error(String(errorCount)) : muted('0')}`);
    console.log(`  Missing API Keys: ${noKeyCount > 0 ? warning(String(noKeyCount)) : muted('0')}`);
    console.log(`  Total Tools:      ${totalTools}`);
    console.log();

    // Show local tools
    const localTools = this.dispatcher.listTools().local;
    console.log(c('Local Tools:', 'cyan'));
    console.log(`  Available:        ${localTools.length}`);
    console.log(`  Tools:            ${localTools.slice(0, 5).join(', ')}${localTools.length > 5 ? '...' : ''}`);
    console.log();

    // Mode info
    console.log(c('Mode:', 'cyan'));
    console.log(`  MCP Mode:         ${client.getMode()}`);
    console.log(`  Tools Enabled:    ${this.enableTools ? success('YES') : warning('NO')}`);
    console.log();
  }

  /**
   * v7.3.6: Pre-warm critical MCP servers in background
   * This prevents cold start timeouts when Genesis needs to use tools
   */
  private preWarmMCPServers(): void {
    // Don't block startup - warm up in background
    const client = getMCPClient();
    const criticalServers: MCPServerName[] = ['memory', 'filesystem', 'github'];

    // Fire and forget - we don't need to wait
    Promise.all(
      criticalServers.map(async (server) => {
        try {
          await client.isAvailable(server);
        } catch {
          // Ignore errors during pre-warming
        }
      })
    ).catch(() => {
      // Silently ignore any errors
    });
  }

  /**
   * v7.4: Run in headless mode (non-interactive, for scripting/CI-CD)
   * Processes a single prompt and outputs the response to stdout
   */
  async runHeadless(prompt: string): Promise<void> {
    // Initialize without UI
    await this.initializeHeadless();

    try {
      let response: string;

      if (this.enableBrain) {
        // Use Brain for processing
        response = await this.brain.process(prompt);
      } else {
        // Direct LLM call with combined system prompt
        const effectiveSystemPrompt = this.customSystemPrompt
          ? `${this.customSystemPrompt}\n\n${this.systemPrompt}`
          : this.systemPrompt;
        const result = await this.llm.chat(prompt, effectiveSystemPrompt);
        response = result.content;
      }

      // Output based on format
      if (this.outputFormat === 'json') {
        const metrics = this.enableBrain ? this.brain.getMetrics() : null;
        const output = {
          success: true,
          response,
          metrics: metrics ? {
            phi: metrics.avgPhi,
            cycles: metrics.totalCycles,
            memoryReuseRate: metrics.memoryReuseRate,
          } : undefined,
        };
        console.log(JSON.stringify(output));
      } else {
        // Plain text output
        console.log(response);
      }

      // Cleanup
      this.cleanupHeadless();
      process.exit(0);

    } catch (err) {
      if (this.outputFormat === 'json') {
        console.log(JSON.stringify({
          success: false,
          error: err instanceof Error ? err.message : String(err),
        }));
      } else {
        console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
      }
      this.cleanupHeadless();
      process.exit(1);
    }
  }

  /**
   * v7.4: Initialize for headless mode (minimal setup, no UI)
   */
  private async initializeHeadless(): Promise<void> {
    // Build system prompt dynamically
    const toolsWithSchemas = this.dispatcher.listToolsWithSchemas();
    this.systemPrompt = await buildSystemPrompt(toolsWithSchemas.mcp, toolsWithSchemas.local);

    // Start brain if enabled
    if (this.enableBrain && !this.brain.isRunning()) {
      this.brain.start();
    }
  }

  /**
   * v7.4: Cleanup for headless mode
   */
  private cleanupHeadless(): void {
    if (this.enableBrain) {
      this.brain.stop();
    }
    if (this.brainEventUnsub) {
      this.brainEventUnsub();
      this.brainEventUnsub = null;
    }
    this.store.close();
  }

  /**
   * Stop chat session
   */
  stop(): void {
    this.running = false;

    // v7.4.5: Execute session-end hook
    if (this.hooks.hasHooks()) {
      // Fire and forget (async but we don't wait)
      this.hooks.execute('session-end', {
        event: 'session-end',
        sessionId: this.store.getState().session?.id,
        workingDir: process.cwd(),
      });
    }

    // v7.3.8: Cleanup brain event subscription
    if (this.brainEventUnsub) {
      this.brainEventUnsub();
      this.brainEventUnsub = null;
    }

    // Stop brain if running
    if (this.enableBrain) {
      console.log(c('\nStopping brain...', 'dim'));
      this.brain.stop();
    }

    // Save state before exit
    console.log(c('Saving state...', 'dim'));
    this.store.updateConversation(this.llm.getHistory());

    // v7.4: Save session for resume
    const state = this.store.getState();
    const sessionId = this.sessionManager.saveSession(state, this.sessionName);
    console.log(c(`Session saved: ${sessionId.slice(0, 8)}`, 'dim'));

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

  // v7.4: Headless mode support
  if (options?.headless && options?.prompt) {
    await session.runHeadless(options.prompt);
    return;
  }

  await session.start();
}

/**
 * v7.4: Run headless mode with prompt from stdin or argument
 * Used by CLI for -p/--print flag
 */
export async function runHeadless(
  prompt: string,
  options?: Omit<ChatOptions, 'headless' | 'prompt'>
): Promise<void> {
  const session = createChatSession({ ...options, headless: true });
  await session.runHeadless(prompt);
}

/**
 * v7.4: Read prompt from stdin (for piping)
 */
export function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    if (process.stdin.isTTY) {
      // No piped input
      resolve('');
      return;
    }

    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', chunk => { data += chunk; });
    process.stdin.on('end', () => resolve(data.trim()));
    process.stdin.on('error', reject);
  });
}
