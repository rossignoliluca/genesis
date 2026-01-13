/**
 * Genesis Phase 10 - Brain Module
 *
 * The Neural Integration Layer - connects all 17 modules.
 *
 * Based on:
 * - arXiv:2508.13171 (Cognitive Workspace) - 54-60% memory reuse
 * - LangGraph Supervisor Pattern - Command({ goto, update })
 * - IWMT (Integrated World Modeling Theory) - GWT + IIT + Active Inference
 *
 * Architecture:
 * ```
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │                           BRAIN                                     │
 * │                                                                     │
 * │  ┌──────────────────────────────────────────────────────────────┐  │
 * │  │                  COGNITIVE WORKSPACE                          │  │
 * │  │  Immediate (8K) → Task (64K) → Episodic (256K) → Semantic    │  │
 * │  │  recall() / anticipate() / consolidate()                      │  │
 * │  └──────────────────────────────────────────────────────────────┘  │
 * │                              │                                      │
 * │  ┌──────────────────────────────────────────────────────────────┐  │
 * │  │                    SUPERVISOR                                 │  │
 * │  │  memory → llm → grounding → tools → done                      │  │
 * │  │  Command({ goto, update })                                    │  │
 * │  └──────────────────────────────────────────────────────────────┘  │
 * │                              │                                      │
 * │  ┌──────────────────────────────────────────────────────────────┐  │
 * │  │               GLOBAL WORKSPACE (φ Monitor)                    │  │
 * │  │  broadcast() → all modules receive                            │  │
 * │  └──────────────────────────────────────────────────────────────┘  │
 * │                              │                                      │
 * │  ┌──────────────────────────────────────────────────────────────┐  │
 * │  │                   HEALING LOOP                                │  │
 * │  │  detect() → diagnose() → fix() → verify() → retry()          │  │
 * │  └──────────────────────────────────────────────────────────────┘  │
 * └─────────────────────────────────────────────────────────────────────┘
 * ```
 */

import {
  BrainState,
  BrainContext,
  BrainConfig,
  BrainMetrics,
  BrainModule,
  Command,
  ToolCall,
  ToolResult,
  GroundingCheck,
  HealingResult,
  GlobalBroadcast,
  BrainEvent,
  BrainEventHandler,
  DEFAULT_BRAIN_CONFIG,
  ContextItem,
} from './types.js';

// Module imports
import {
  CognitiveWorkspace,
  getCognitiveWorkspace,
  AnticipationContext,
} from '../memory/cognitive-workspace.js';
import {
  GlobalWorkspace,
  createGlobalWorkspace,
  createWorkspaceContent,
} from '../consciousness/global-workspace.js';
import {
  PhiMonitor,
  createPhiMonitor,
} from '../consciousness/phi-monitor.js';
import {
  LLMBridge,
  getLLMBridge,
  buildSystemPrompt,
} from '../llm/index.js';
import {
  ToolDispatcher,
  ToolResult as DispatcherToolResult,
} from '../cli/dispatcher.js';
import {
  healing,
  autoFix,
} from '../healing/index.js';
import {
  GroundingSystem,
  getGroundingSystem,
} from '../grounding/index.js';

// v7.6: Extended Thinking System
import {
  ThinkingEngine,
  getThinkingEngine,
  ThinkingConfig,
  ThinkingResult,
} from '../thinking/index.js';

// ============================================================================
// Brain Class
// ============================================================================

export class Brain {
  private config: BrainConfig;

  // Core modules
  private workspace: CognitiveWorkspace;
  private globalWorkspace: GlobalWorkspace;
  private phiMonitor: PhiMonitor;
  private llm: LLMBridge;
  private dispatcher: ToolDispatcher;
  private grounding: GroundingSystem;
  private thinking: ThinkingEngine;  // v7.6: Extended thinking

  // State
  private running: boolean = false;
  private currentState: BrainState | null = null;
  private systemPrompt: string = ''; // v7.2: Cached system prompt with tools

  // Metrics
  private metrics: BrainMetrics = this.createInitialMetrics();

  // Event handlers
  private eventHandlers: Set<BrainEventHandler> = new Set();

  constructor(config: Partial<BrainConfig> = {}) {
    this.config = { ...DEFAULT_BRAIN_CONFIG, ...config };

    // Initialize modules
    this.workspace = getCognitiveWorkspace({
      maxItems: 7,
      maxTokens: this.config.memory.maxContextTokens,
    });

    this.globalWorkspace = createGlobalWorkspace({
      capacity: 7,
      selectionIntervalMs: 100,
    });

    this.phiMonitor = createPhiMonitor({
      minPhi: this.config.consciousness.phiThreshold,
      updateIntervalMs: 5000,
    });

    this.llm = getLLMBridge();
    this.dispatcher = new ToolDispatcher({ verbose: false });
    this.grounding = getGroundingSystem();

    // v7.6: Initialize extended thinking
    this.thinking = getThinkingEngine({
      enableExtendedThinking: true,
      enableSelfCritique: true,
      enableMetacognition: true,
      enableDeliberativeAlignment: true,
      thinkingBudget: 4096,
    });
  }

  // ============================================================================
  // Lifecycle
  // ============================================================================

  /**
   * Start the brain (initializes consciousness monitoring)
   */
  async start(): Promise<void> {
    if (this.running) return;

    this.running = true;

    // v7.2: Build system prompt with available tools
    await this.initializeSystemPrompt();

    // Start consciousness monitoring
    if (this.config.consciousness.enabled) {
      this.phiMonitor.start();
      this.globalWorkspace.start();
    }

    // Start memory curation
    if (this.config.memory.enabled) {
      this.workspace.startAutoCuration();
    }

    this.emit({ type: 'cycle_start', timestamp: new Date(), data: { status: 'brain_started' } });
  }

  /**
   * v7.2: Build system prompt with all available tools
   */
  private async initializeSystemPrompt(): Promise<void> {
    if (this.systemPrompt) return; // Already built

    const tools = this.dispatcher.listToolsWithSchemas();

    // Convert to format expected by buildSystemPrompt
    const mcpTools: Record<string, Array<{ name: string; description?: string }>> = tools.mcp;
    const localTools = tools.local;

    this.systemPrompt = await buildSystemPrompt(mcpTools, localTools, true);
  }

  /**
   * Stop the brain
   */
  stop(): void {
    if (!this.running) return;

    this.running = false;

    this.phiMonitor.stop();
    this.globalWorkspace.stop();
    this.workspace.stopAutoCuration();

    this.emit({ type: 'cycle_complete', timestamp: new Date(), data: { status: 'brain_stopped' } });
  }

  /**
   * Check if brain is running
   */
  isRunning(): boolean {
    return this.running;
  }

  // ============================================================================
  // Main Processing Loop
  // ============================================================================

  /**
   * Process an input through the brain
   *
   * This is the main entry point. It follows the supervisor pattern:
   * memory → llm → grounding → tools → done
   *
   * Each module can route to another via Command({ goto, update })
   */
  async process(input: string): Promise<string> {
    const startTime = Date.now();

    // Initialize state
    let state: BrainState = {
      query: input,
      context: this.createEmptyContext(),
      response: '',
      toolCalls: [],
      toolResults: [],
      phi: this.getCurrentPhi(),
      ignited: false,
      verified: false,
      healingAttempts: 0,
      startTime,
      moduleHistory: [],
    };

    // Initial command: start with memory
    let command: Command = {
      goto: this.config.memory.enabled ? 'memory' : 'llm',
      update: {},
      reason: 'initial',
    };

    this.emit({ type: 'cycle_start', timestamp: new Date(), data: { query: input } });

    // Supervisor loop
    let transitions = 0;
    while (command.goto !== 'done' && transitions < this.config.maxModuleTransitions) {
      // Update state
      state = { ...state, ...command.update };
      state.moduleHistory.push(command.goto);

      // Check timeout
      if (Date.now() - startTime > this.config.maxCycleTime) {
        command = { goto: 'done', update: { response: 'Processing timeout. Please try again.' } };
        break;
      }

      try {
        this.emit({ type: 'module_enter', timestamp: new Date(), data: { module: command.goto }, module: command.goto });

        // Execute module
        command = await this.step(command.goto, state);

        this.emit({ type: 'module_exit', timestamp: new Date(), data: { module: command.goto, nextModule: command.goto }, module: command.goto });

        // Broadcast to global workspace if enabled
        if (this.config.consciousness.broadcastEnabled) {
          this.broadcast(state, command.goto);
        }

        transitions++;

      } catch (error) {
        // Healing loop
        if (this.config.healing.enabled && this.config.healing.autoHeal) {
          command = await this.heal(error as Error, state);
        } else {
          command = {
            goto: 'done',
            update: {
              response: `Error: ${error instanceof Error ? error.message : String(error)}`,
              error: error as Error,
            },
          };
        }
      }
    }

    // Final state update
    state = { ...state, ...command.update };
    this.currentState = state;

    // Update metrics
    this.updateMetrics(state, transitions);

    this.emit({ type: 'cycle_complete', timestamp: new Date(), data: { state, transitions } });

    return state.response;
  }

  // ============================================================================
  // Module Execution
  // ============================================================================

  /**
   * Execute a single module step
   */
  private async step(module: BrainModule, state: BrainState): Promise<Command> {
    switch (module) {
      case 'memory':
        return this.stepMemory(state);

      case 'llm':
        return this.stepLLM(state);

      case 'grounding':
        return this.stepGrounding(state);

      case 'tools':
        return this.stepTools(state);

      case 'healing':
        return this.stepHealing(state);

      case 'consciousness':
        return this.stepConsciousness(state);

      case 'kernel':
        return this.stepKernel(state);

      case 'thinking':
        return this.stepThinking(state);

      default:
        return { goto: 'done', update: {} };
    }
  }

  /**
   * Memory module: recall context and anticipate needs
   */
  private async stepMemory(state: BrainState): Promise<Command> {
    this.emit({ type: 'memory_recall', timestamp: new Date(), data: { query: state.query } });

    // Build anticipation context
    const anticipationContext: AnticipationContext = {
      task: state.query,
      keywords: state.query.split(/\s+/).filter(w => w.length > 3),
    };

    // Anticipate needed memories (proactive retrieval)
    if (this.config.memory.anticipationEnabled) {
      try {
        const anticipated = await this.workspace.anticipate(anticipationContext);
        this.metrics.anticipationHits += anticipated.length;
        this.emit({ type: 'memory_anticipate', timestamp: new Date(), data: { items: anticipated.length } });
      } catch {
        // Anticipation failed, continue without it
      }
    }

    // Build context from working memory
    const context = this.buildContext(state);

    // Track metrics
    this.metrics.memoryRecalls++;
    const wsMetrics = this.workspace.getMetrics();
    this.metrics.memoryReuseRate = wsMetrics.reuseRate;

    // v7.6: Route through thinking module for extended reasoning
    return {
      goto: 'thinking',
      update: { context },
      reason: 'context_retrieved',
    };
  }

  /**
   * LLM module: generate response
   */
  private async stepLLM(state: BrainState): Promise<Command> {
    this.emit({ type: 'llm_request', timestamp: new Date(), data: { query: state.query } });

    // Build prompt with context
    const contextStr = state.context.formatted || '';
    const prompt = contextStr
      ? `Context:\n${contextStr}\n\nUser: ${state.query}`
      : state.query;

    // Call LLM with system prompt that includes available tools
    const response = await this.llm.chat(prompt, this.systemPrompt || undefined);

    this.emit({ type: 'llm_response', timestamp: new Date(), data: { length: response.content.length } });

    // Parse tool calls if any
    const toolCalls = this.parseToolCalls(response.content);

    // Decide next step
    if (toolCalls.length > 0 && this.config.tools.enabled) {
      return {
        goto: 'tools',
        update: { response: response.content, toolCalls },
        reason: 'tool_calls_detected',
      };
    }

    if (this.config.grounding.verifyAllResponses && this.config.grounding.enabled) {
      return {
        goto: 'grounding',
        update: { response: response.content },
        reason: 'verify_response',
      };
    }

    return {
      goto: 'done',
      update: { response: response.content },
      reason: 'response_complete',
    };
  }

  /**
   * Grounding module: verify claims in response
   */
  private async stepGrounding(state: BrainState): Promise<Command> {
    this.emit({ type: 'grounding_check', timestamp: new Date(), data: { response: state.response.slice(0, 100) } });

    this.metrics.groundingChecks++;

    // Ground the response
    const claim = await this.grounding.ground(state.response);

    // Check if needs human
    if (this.grounding.needsHuman(claim)) {
      this.metrics.humanConsultations++;
      const question = this.grounding.getQuestion(claim);
      return {
        goto: 'done',
        update: {
          response: state.response + `\n\n[Human verification needed: ${question}]`,
          verified: false,
        },
        reason: 'needs_human',
      };
    }

    // Check confidence
    if (claim.confidence < this.config.grounding.confidenceThreshold) {
      this.metrics.groundingFailures++;
      return {
        goto: 'llm',
        update: {
          groundingFeedback: `Low confidence (${(claim.confidence * 100).toFixed(0)}%). Please reconsider.`,
        },
        reason: 'low_confidence',
      };
    }

    this.metrics.groundingPasses++;

    return {
      goto: 'done',
      update: { verified: true },
      reason: 'verified',
    };
  }

  /**
   * Tools module: execute tool calls
   */
  private async stepTools(state: BrainState): Promise<Command> {
    if (state.toolCalls.length === 0) {
      return { goto: 'done', update: {}, reason: 'no_tools' };
    }

    // Limit executions
    const callsToExecute = state.toolCalls.slice(0, this.config.tools.maxExecutions);

    this.emit({ type: 'tool_execute', timestamp: new Date(), data: { count: callsToExecute.length } });

    // Parse tool calls for dispatcher
    const dispatcherCalls = this.dispatcher.parseToolCalls(state.response);
    const results: ToolResult[] = [];

    if (dispatcherCalls.length > 0) {
      const dispatchResult = await this.dispatcher.dispatch(dispatcherCalls);

      for (const r of dispatchResult.results) {
        results.push({
          name: r.name,
          success: r.success,
          data: r.data,
          error: r.error,
          duration: r.duration,
        });

        if (r.success) {
          this.metrics.toolSuccesses++;
        } else {
          this.metrics.toolFailures++;
        }
      }
    }

    this.metrics.toolExecutions += results.length;

    this.emit({ type: 'tool_complete', timestamp: new Date(), data: { results: results.length } });

    // Format results for LLM
    const resultsStr = results.map(r =>
      r.success
        ? `[${r.name}] SUCCESS: ${typeof r.data === 'string' ? r.data.slice(0, 500) : JSON.stringify(r.data).slice(0, 500)}`
        : `[${r.name}] ERROR: ${r.error}`
    ).join('\n\n');

    return {
      goto: 'llm',
      update: {
        toolResults: results,
        context: {
          ...state.context,
          formatted: state.context.formatted + `\n\nTool Results:\n${resultsStr}`,
        },
      },
      reason: 'tool_results',
    };
  }

  /**
   * Healing module: recover from errors
   */
  private async stepHealing(state: BrainState): Promise<Command> {
    if (!state.error) {
      return { goto: 'done', update: {}, reason: 'no_error' };
    }

    this.emit({ type: 'healing_start', timestamp: new Date(), data: { error: state.error.message } });

    this.metrics.healingAttempts++;

    // Check if we've exceeded max attempts
    if (state.healingAttempts >= this.config.healing.maxAttempts) {
      this.metrics.healingFailures++;
      return {
        goto: 'done',
        update: {
          response: `Unable to recover after ${state.healingAttempts} attempts. Error: ${state.error.message}`,
        },
        reason: 'max_attempts',
      };
    }

    // Try to detect and fix
    const hasErrors = healing.hasErrors(state.error.message);
    if (hasErrors) {
      const detected = healing.detectErrors(state.error.message);
      if (detected.errors.length > 0) {
        // Attempt auto-fix
        const fixResult = await healing.autoFix(state.error.message);
        if (fixResult.success) {
          this.metrics.healingSuccesses++;
          this.emit({ type: 'healing_complete', timestamp: new Date(), data: { success: true } });
          return {
            goto: 'llm',
            update: {
              error: undefined,
              healingAttempts: state.healingAttempts + 1,
              context: {
                ...state.context,
                formatted: state.context.formatted + '\n\n[Auto-fix applied]',
              },
            },
            reason: 'healed',
          };
        }
      }
    }

    this.metrics.healingFailures++;
    this.emit({ type: 'healing_complete', timestamp: new Date(), data: { success: false } });

    return {
      goto: 'done',
      update: {
        response: `Error occurred: ${state.error.message}`,
        healingAttempts: state.healingAttempts + 1,
      },
      reason: 'healing_failed',
    };
  }

  /**
   * Consciousness module: check φ level
   */
  private async stepConsciousness(state: BrainState): Promise<Command> {
    const phi = this.getCurrentPhi();

    this.emit({ type: 'phi_update', timestamp: new Date(), data: { phi } });

    if (phi < this.config.consciousness.phiThreshold) {
      this.metrics.phiViolations++;
      return {
        goto: 'done',
        update: {
          phi,
          response: `[Consciousness level (φ=${phi.toFixed(2)}) below threshold. System paused.]`,
        },
        reason: 'phi_low',
      };
    }

    return {
      goto: 'done',
      update: { phi },
      reason: 'phi_ok',
    };
  }

  /**
   * Kernel module: delegate to agent orchestration
   * (Placeholder for future kernel integration)
   */
  private async stepKernel(state: BrainState): Promise<Command> {
    // For now, just pass through to LLM
    return {
      goto: 'llm',
      update: {},
      reason: 'kernel_passthrough',
    };
  }

  /**
   * Thinking module: Extended thinking with scratchpad, self-critique, and metacognition
   * v7.6: Frontier-grade reasoning
   */
  private async stepThinking(state: BrainState): Promise<Command> {
    this.emit({ type: 'module_enter', timestamp: new Date(), data: { module: 'thinking' }, module: 'thinking' as BrainModule });

    try {
      // Build context string
      const contextStr = state.context.formatted || '';

      // Run extended thinking
      const result: ThinkingResult = await this.thinking.think(
        state.query,
        contextStr,
        this.systemPrompt
      );

      // Track metrics
      this.metrics.thinkingSteps = (this.metrics.thinkingSteps || 0) + result.thinking.length;
      this.metrics.thinkingTokens = (this.metrics.thinkingTokens || 0) + result.totalThinkingTokens;
      this.metrics.avgConfidence = result.confidence;

      // Emit thinking events
      for (const step of result.thinking) {
        this.emit({
          type: 'thinking_step' as any,
          timestamp: new Date(),
          data: {
            stepType: step.type,
            confidence: step.confidence,
            tokens: step.tokenCount,
          },
        });
      }

      // Check confidence threshold - if too low, flag uncertainties
      const uncertaintyNote = result.confidence < 0.5 && result.uncertainties.length > 0
        ? `\n\n[Note: Confidence ${(result.confidence * 100).toFixed(0)}% - Uncertainties: ${result.uncertainties.slice(0, 2).join(', ')}]`
        : '';

      // Check for tool calls in response
      const toolCalls = this.parseToolCalls(result.response);

      if (toolCalls.length > 0 && this.config.tools.enabled) {
        return {
          goto: 'tools',
          update: {
            response: result.response + uncertaintyNote,
            toolCalls,
            thinkingResult: result,
          },
          reason: 'thinking_tool_calls',
        };
      }

      // If grounding is needed
      if (this.config.grounding.verifyAllResponses && this.config.grounding.enabled) {
        return {
          goto: 'grounding',
          update: {
            response: result.response + uncertaintyNote,
            thinkingResult: result,
          },
          reason: 'thinking_verify',
        };
      }

      return {
        goto: 'done',
        update: {
          response: result.response + uncertaintyNote,
          thinkingResult: result,
        },
        reason: 'thinking_complete',
      };
    } catch (error) {
      // Fallback to regular LLM if thinking fails
      this.emit({
        type: 'module_exit',
        timestamp: new Date(),
        data: { error: error instanceof Error ? error.message : String(error) },
        module: 'thinking' as BrainModule,
      });

      return {
        goto: 'llm',
        update: {},
        reason: 'thinking_fallback',
      };
    }
  }

  // ============================================================================
  // Healing Loop
  // ============================================================================

  /**
   * Attempt to heal from an error
   */
  private async heal(error: Error, state: BrainState): Promise<Command> {
    this.emit({ type: 'healing_start', timestamp: new Date(), data: { error: error.message } });

    // Update state with error
    state.error = error;
    state.healingAttempts++;

    // Check if healing is enabled
    if (!this.config.healing.enabled) {
      return {
        goto: 'done',
        update: {
          response: `Error: ${error.message}`,
          error,
        },
        reason: 'healing_disabled',
      };
    }

    // Attempt healing
    return this.stepHealing(state);
  }

  // ============================================================================
  // Global Workspace Broadcasting
  // ============================================================================

  /**
   * Broadcast to global workspace
   */
  private broadcast(state: BrainState, source: BrainModule): void {
    if (!this.config.consciousness.broadcastEnabled) return;

    const content = createWorkspaceContent(
      source,
      'thought',
      {
        query: state.query,
        response: state.response?.slice(0, 200),
        phi: state.phi,
      },
      {
        salience: state.phi,
        relevance: 0.8,
      }
    );

    // Note: GlobalWorkspace.broadcast expects internal competition/selection
    // For direct broadcasting, we would need to extend the API
    // For now, we emit a brain event
    this.metrics.broadcasts++;
    this.emit({
      type: 'broadcast',
      timestamp: new Date(),
      data: { source, content: state },
      module: source,
    });
  }

  // ============================================================================
  // Context Building
  // ============================================================================

  /**
   * Build context from cognitive workspace
   */
  private buildContext(state: BrainState): BrainContext {
    const items = this.workspace.getActive();

    const context: BrainContext = {
      immediate: [],
      task: [],
      episodic: [],
      semantic: [],
      formatted: '',
      tokenEstimate: 0,
      reuseRate: this.workspace.getMetrics().reuseRate,
    };

    // Categorize items
    for (const item of items) {
      const contextItem: ContextItem = {
        id: item.id,
        type: item.source === 'anticipate' ? 'task' : 'immediate',
        content: JSON.stringify(item.memory),
        relevance: item.relevance,
        activation: item.activation,
        source: item.source,
      };

      // Categorize by memory type
      if (item.memory.type === 'episodic') {
        context.episodic.push(contextItem);
      } else if (item.memory.type === 'semantic') {
        context.semantic.push(contextItem);
      } else {
        context.task.push(contextItem);
      }
    }

    // Build formatted string (limit to maxContextTokens)
    const allItems = [...context.immediate, ...context.task, ...context.episodic, ...context.semantic];
    let formatted = '';
    let tokens = 0;
    const maxTokens = this.config.memory.maxContextTokens;

    for (const item of allItems.sort((a, b) => b.relevance - a.relevance)) {
      const itemTokens = Math.ceil(item.content.length / 4);
      if (tokens + itemTokens > maxTokens) break;

      formatted += `[${item.type}] ${item.content}\n`;
      tokens += itemTokens;
    }

    context.formatted = formatted;
    context.tokenEstimate = tokens;

    return context;
  }

  /**
   * Create empty context
   */
  private createEmptyContext(): BrainContext {
    return {
      immediate: [],
      task: [],
      episodic: [],
      semantic: [],
      formatted: '',
      tokenEstimate: 0,
      reuseRate: 0,
    };
  }

  // ============================================================================
  // Tool Parsing
  // ============================================================================

  /**
   * Parse tool calls from LLM response
   */
  private parseToolCalls(response: string): ToolCall[] {
    const calls: ToolCall[] = [];

    // Parse <invoke> tags
    const invokePattern = /<invoke\s+name="([^"]+)">([\s\S]*?)<\/invoke>/g;
    let match;

    while ((match = invokePattern.exec(response)) !== null) {
      const name = match[1];
      const paramsXml = match[2];
      const params: Record<string, unknown> = {};

      // Parse parameters
      const paramPattern = /<parameter\s+name="([^"]+)">([\s\S]*?)<\/parameter>/g;
      let paramMatch;
      while ((paramMatch = paramPattern.exec(paramsXml)) !== null) {
        const paramName = paramMatch[1];
        const paramValue = paramMatch[2].trim();

        // Try to parse as JSON
        try {
          params[paramName] = JSON.parse(paramValue);
        } catch {
          params[paramName] = paramValue;
        }
      }

      calls.push({
        name,
        parameters: params,
        raw: match[0],
      });
    }

    return calls;
  }

  // ============================================================================
  // Consciousness Integration
  // ============================================================================

  /**
   * Get current φ level
   */
  private getCurrentPhi(): number {
    if (!this.config.consciousness.enabled) return 1.0;

    try {
      const level = this.phiMonitor.getCurrentLevel();
      return level.phi;
    } catch {
      return 0.5; // Default if monitor not available
    }
  }

  // ============================================================================
  // Metrics
  // ============================================================================

  /**
   * Create initial metrics
   */
  private createInitialMetrics(): BrainMetrics {
    return {
      totalCycles: 0,
      successfulCycles: 0,
      failedCycles: 0,
      avgCycleTime: 0,
      memoryRecalls: 0,
      memoryReuseRate: 0,
      anticipationHits: 0,
      anticipationMisses: 0,
      groundingChecks: 0,
      groundingPasses: 0,
      groundingFailures: 0,
      humanConsultations: 0,
      toolExecutions: 0,
      toolSuccesses: 0,
      toolFailures: 0,
      healingAttempts: 0,
      healingSuccesses: 0,
      healingFailures: 0,
      avgPhi: 0,
      phiViolations: 0,
      broadcasts: 0,
      moduleTransitions: {},
    };
  }

  /**
   * Update metrics after a cycle
   */
  private updateMetrics(state: BrainState, transitions: number): void {
    const cycleTime = Date.now() - state.startTime;

    this.metrics.totalCycles++;
    if (!state.error) {
      this.metrics.successfulCycles++;
    } else {
      this.metrics.failedCycles++;
    }

    // Update average cycle time
    this.metrics.avgCycleTime =
      (this.metrics.avgCycleTime * (this.metrics.totalCycles - 1) + cycleTime) /
      this.metrics.totalCycles;

    // Update average phi
    this.metrics.avgPhi =
      (this.metrics.avgPhi * (this.metrics.totalCycles - 1) + state.phi) /
      this.metrics.totalCycles;

    // Track module transitions
    for (const module of state.moduleHistory) {
      this.metrics.moduleTransitions[module] =
        (this.metrics.moduleTransitions[module] || 0) + 1;
    }
  }

  /**
   * Get current metrics
   */
  getMetrics(): BrainMetrics {
    return { ...this.metrics };
  }

  /**
   * Reset metrics
   */
  resetMetrics(): void {
    this.metrics = this.createInitialMetrics();
  }

  // ============================================================================
  // Events
  // ============================================================================

  /**
   * Subscribe to brain events
   */
  on(handler: BrainEventHandler): () => void {
    this.eventHandlers.add(handler);
    return () => this.eventHandlers.delete(handler);
  }

  /**
   * Emit brain event
   */
  private emit(event: BrainEvent): void {
    for (const handler of this.eventHandlers) {
      try {
        handler(event);
      } catch (err) {
        console.error('Brain event handler error:', err);
      }
    }
  }

  // ============================================================================
  // Status & Debug
  // ============================================================================

  /**
   * Get brain status
   */
  getStatus(): {
    running: boolean;
    phi: number;
    memoryReuseRate: number;
    lastState: BrainState | null;
    metrics: BrainMetrics;
    moduleStates: Record<string, boolean>;
  } {
    return {
      running: this.running,
      phi: this.getCurrentPhi(),
      memoryReuseRate: this.workspace.getMetrics().reuseRate,
      lastState: this.currentState,
      metrics: this.getMetrics(),
      moduleStates: {
        memory: this.config.memory.enabled,
        llm: this.config.llm.enabled,
        grounding: this.config.grounding.enabled,
        tools: this.config.tools.enabled,
        healing: this.config.healing.enabled,
        consciousness: this.config.consciousness.enabled,
      },
    };
  }

  /**
   * Get configuration
   */
  getConfig(): BrainConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<BrainConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

// ============================================================================
// Factory & Singleton
// ============================================================================

export function createBrain(config?: Partial<BrainConfig>): Brain {
  return new Brain(config);
}

let brainInstance: Brain | null = null;

export function getBrain(config?: Partial<BrainConfig>): Brain {
  if (!brainInstance) {
    brainInstance = createBrain(config);
  }
  return brainInstance;
}

export function resetBrain(): void {
  if (brainInstance) {
    brainInstance.stop();
    brainInstance = null;
  }
}

// ============================================================================
// Re-exports
// ============================================================================

export * from './types.js';
export * from './trace.js';
