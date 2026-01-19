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
  ModelTier,
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
  LIGHTWEIGHT_THINKING_CONFIG,
} from '../thinking/index.js';

// v7.13: Full Module Integration
import {
  getAutonomousLoop,
  AutonomousLoop,
  getObservationGatherer,
} from '../active-inference/index.js';
import {
  SubagentExecutor,
  getSubagentExecutor,
} from '../subagents/executor.js';
import {
  Kernel,
  getKernel,
} from '../kernel/index.js';
import {
  getStateStore,
  StateStore,
} from '../persistence/index.js';
import {
  WorldModelSystem,
  getWorldModelSystem,
} from '../world-model/index.js';
import {
  getDarwinGodelEngine,
  DarwinGodelEngine,
} from '../self-modification/index.js';

// v8.1: Brain State Persistence
import {
  BrainStatePersistence,
  getBrainStatePersistence,
} from './persistence.js';

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

  // v7.13: Full module integration
  private activeInference: AutonomousLoop | null = null;
  private subagentExecutor: SubagentExecutor | null = null;
  private kernel: Kernel | null = null;
  private stateStore: StateStore | null = null;
  private worldModel: WorldModelSystem | null = null;
  private darwinGodel: DarwinGodelEngine | null = null;

  // v8.1: State Persistence
  private persistence: BrainStatePersistence;

  // v8.2: Tool Results Cache (approved self-modification)
  private toolCache: Map<string, { result: ToolResult; timestamp: number }> = new Map();
  private readonly TOOL_CACHE_TTL = 60000; // 1 minute TTL
  private readonly TOOL_CACHE_MAX_SIZE = 100;

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
    // Auto-detect slow local LLM (Ollama) and use lightweight config
    const llmStatus = this.llm.status();
    const isSlowLocalLLM = llmStatus.isLocal || llmStatus.provider === 'ollama';

    if (isSlowLocalLLM) {
      // Use lightweight config for Ollama (2 LLM calls vs 8+)
      this.thinking = getThinkingEngine(LIGHTWEIGHT_THINKING_CONFIG);
    } else {
      // Full thinking for fast cloud LLMs
      this.thinking = getThinkingEngine({
        enableExtendedThinking: true,
        enableSelfCritique: true,
        enableMetacognition: true,
        enableDeliberativeAlignment: true,
        thinkingBudget: 4096,
      });
    }

    // v8.1: Initialize state persistence and load persisted metrics
    this.persistence = getBrainStatePersistence();
    this.metrics = { ...this.metrics, ...this.persistence.getMetrics() };

    // v7.13: Initialize full module integration (lazy - on first use)
    this.initializeV713Modules();
  }

  /**
   * v7.13: Initialize new module integrations
   * v7.18: Connect real PhiMonitor and dispatcher for full integration
   */
  private initializeV713Modules(): void {
    try {
      // Active Inference - Free Energy minimization
      this.activeInference = getAutonomousLoop();

      // v7.18: Configure observation gatherer with real system state
      const observationGatherer = getObservationGatherer();
      observationGatherer.configure({
        phiState: () => {
          const level = this.phiMonitor.getCurrentLevel();
          // Map phi to PhiState: dormant < 0.2, drowsy < 0.4, aware < 0.7, alert >= 0.7
          const state: 'dormant' | 'drowsy' | 'aware' | 'alert' =
            level.phi >= 0.7 ? 'alert'
            : level.phi >= 0.4 ? 'aware'
            : level.phi >= 0.2 ? 'drowsy'
            : 'dormant';
          return { phi: level.phi, state };
        },
        kernelState: () => ({
          energy: 1.0, // Brain doesn't track energy, default to full
          state: this.running ? 'thinking' : 'idle',
          taskStatus: 'pending' as const,
        }),
      });
    } catch {
      // Module may not be configured
    }

    try {
      // Subagent Executor - specialized task delegation
      this.subagentExecutor = getSubagentExecutor();
      // v7.18: Connect dispatcher for multi-turn tool execution
      this.subagentExecutor.setDispatcher(this.dispatcher);
    } catch {
      // Module may not be configured
    }

    try {
      // Kernel - multi-agent orchestration
      this.kernel = getKernel();
    } catch {
      // Module may not be configured
    }

    try {
      // State Store - persistence
      this.stateStore = getStateStore();
    } catch {
      // Module may not be configured
    }

    try {
      // World Model - predictive modeling
      this.worldModel = getWorldModelSystem();
    } catch {
      // Module may not be configured
    }

    try {
      // Darwin-Gödel Engine - self-modification
      this.darwinGodel = getDarwinGodelEngine();
    } catch {
      // Module may not be configured
    }
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

  /**
   * v8.4: Check for self-improvement opportunities
   *
   * This method can be called periodically (e.g., by daemon during idle periods)
   * to discover and optionally apply improvements.
   *
   * @param autoApply - If true, automatically apply discovered improvements
   * @returns Improvement results or opportunities
   */
  async checkForImprovements(autoApply: boolean = false): Promise<{
    success: boolean;
    opportunities?: Array<{ metric: string; description: string; priority: number }>;
    applied?: Array<{ id: string; success: boolean }>;
    error?: string;
  }> {
    try {
      // Check consciousness level
      const phi = this.getCurrentPhi();
      if (phi < 0.3) {
        return {
          success: false,
          error: `Consciousness level too low: φ=${phi.toFixed(3)} (need ≥0.3)`,
        };
      }

      // Import action executor
      const { executeAction } = await import('../active-inference/actions.js');

      // Run improve.self action
      const result = await executeAction('improve.self' as any, {
        parameters: { autoApply },
        beliefs: { viability: 0.5, worldState: 0.5, coupling: 0.5, goalProgress: 0.5 },
      });

      if (result.success) {
        if (result.data?.opportunities) {
          return {
            success: true,
            opportunities: result.data.opportunities,
          };
        }
        if (result.data?.applied) {
          return {
            success: true,
            applied: result.data.improvements,
          };
        }
        return { success: true };
      }

      return {
        success: false,
        error: result.error || 'Unknown error',
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * v8.4: Get the current self-model
   *
   * Returns Genesis's understanding of its own architecture
   */
  async getSelfModel(): Promise<any> {
    try {
      const { generateSelfModel } = await import('../self-modification/self-model.js');
      return await generateSelfModel();
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
  }

  /**
   * v8.5: Query own source code with semantic search
   *
   * Uses RAG (Retrieval-Augmented Generation) to find relevant code
   * for self-understanding and improvement.
   */
  async queryCode(query: string, options: { topK?: number; rebuild?: boolean } = {}): Promise<{
    results: Array<{ name: string; type: string; file: string; score: number; content: string }>;
    stats?: { files: number; chunks: number; lines: number };
    error?: string;
  }> {
    try {
      const { getCodeRAG } = await import('../self-modification/code-rag.js');
      const rag = getCodeRAG();

      // Build index if needed or requested
      if (options.rebuild || !rag.getStats()) {
        await rag.buildIndex();
      }

      const results = rag.query(query, options.topK || 5);
      const stats = rag.getStats();

      return {
        results: results.map(r => ({
          name: r.chunk.name,
          type: r.chunk.type,
          file: r.chunk.relativePath,
          score: r.score,
          content: r.chunk.content.slice(0, 500) + (r.chunk.content.length > 500 ? '...' : ''),
        })),
        stats: stats ? {
          files: stats.totalFiles,
          chunks: stats.totalChunks,
          lines: stats.totalLines,
        } : undefined,
      };
    } catch (error) {
      return {
        results: [],
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * v8.5: Get code summary for LLM context
   */
  async getCodeSummary(): Promise<string> {
    try {
      const { getCodeRAG } = await import('../self-modification/code-rag.js');
      const rag = getCodeRAG();

      if (!rag.getStats()) {
        await rag.buildIndex();
      }

      return rag.getSummary();
    } catch (error) {
      return `Error generating code summary: ${error instanceof Error ? error.message : error}`;
    }
  }

  /**
   * v8.5: Persist self-model to memory graph
   *
   * Stores Genesis's self-understanding in persistent memory (local graph file).
   * This enables cross-session architectural awareness.
   */
  async persistSelfKnowledge(): Promise<{
    success: boolean;
    entitiesCreated: number;
    relationsCreated: number;
    graphPath?: string;
    error?: string;
  }> {
    try {
      const { persistSelfModelToMemory } = await import('../self-modification/self-model.js');
      return await persistSelfModelToMemory();
    } catch (error) {
      return {
        success: false,
        entitiesCreated: 0,
        relationsCreated: 0,
        error: error instanceof Error ? error.message : String(error),
      };
    }
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
    let consecutiveErrors = 0; // v7.18: Track consecutive failures for early exit
    const MAX_CONSECUTIVE_ERRORS = 3;

    while (command.goto !== 'done' && transitions < this.config.maxModuleTransitions) {
      // Update state
      state = { ...state, ...command.update };
      state.moduleHistory.push(command.goto);

      // Check timeout
      if (Date.now() - startTime > this.config.maxCycleTime) {
        command = { goto: 'done', update: { response: 'Processing timeout. Please try again.' } };
        break;
      }

      // v7.18: Early exit on repeated failures
      if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
        command = {
          goto: 'done',
          update: { response: `Unable to complete after ${consecutiveErrors} consecutive errors. Please try again.` },
        };
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

        consecutiveErrors = 0; // Reset on success
        transitions++;

      } catch (error) {
        consecutiveErrors++; // v7.18: Track consecutive errors

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

    // v7.13: Auto-persistence after each cycle
    await this.autoPersist(state);

    this.emit({ type: 'cycle_complete', timestamp: new Date(), data: { state, transitions } });

    return state.response;
  }

  /**
   * v7.13: Auto-persist state after each processing cycle
   */
  private async autoPersist(state: BrainState): Promise<void> {
    if (!this.stateStore) return;

    try {
      // Update session state with cycle info using valid GenesisState fields
      this.stateStore.update({
        session: {
          id: this.stateStore.getState().session?.id || `brain-${Date.now()}`,
          startTime: this.stateStore.getState().session?.startTime || new Date(),
          interactions: this.metrics.totalCycles,
          lastActivity: new Date(),
        },
      });
      await this.stateStore.save();
    } catch {
      // Persistence failures are non-fatal - log but don't throw
    }
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

      // v7.13: New module integrations
      case 'active-inference':
        return this.stepActiveInference(state);

      case 'subagents':
        return this.stepSubagents(state);

      case 'world-model':
        return this.stepWorldModel(state);

      case 'self-modify':
        return this.stepSelfModify(state);

      case 'organism':
        return this.stepOrganism(state);

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
   * v7.18: Determine optimal model tier based on task complexity
   * - fast: Simple queries, short responses, tool formatting
   * - balanced: Complex reasoning, creative tasks
   */
  private determineModelTier(query: string, hasToolResults: boolean): ModelTier {
    const wordCount = query.split(/\s+/).length;
    const lowerQuery = query.toLowerCase();

    // Use fast tier for:
    // - Short queries (< 50 words)
    // - Tool result formatting
    // - Simple questions
    const isSimple = wordCount < 50 &&
                     !lowerQuery.includes('explain') &&
                     !lowerQuery.includes('analyze') &&
                     !lowerQuery.includes('design') &&
                     !lowerQuery.includes('implement') &&
                     !lowerQuery.includes('create') &&
                     !lowerQuery.includes('refactor');

    if (isSimple || hasToolResults) {
      return 'fast';
    }

    return 'balanced';
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

    // v7.18: Cost optimization - use tiered models
    const hasToolResults = state.toolResults && state.toolResults.length > 0;
    const tier = this.determineModelTier(state.query, hasToolResults);

    // Call LLM with appropriate model tier
    const response = await this.llm.chatWithTier(prompt, tier, this.systemPrompt || undefined);

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
   * v8.2: Added caching for repeated tool calls
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

    // v8.2: Check cache and clean expired entries
    this.cleanToolCache();

    if (dispatcherCalls.length > 0) {
      const uncachedCalls: typeof dispatcherCalls = [];

      // v8.2: Check cache for each call
      for (const call of dispatcherCalls) {
        const cacheKey = this.getToolCacheKey(call);
        const cached = this.toolCache.get(cacheKey);

        if (cached && (Date.now() - cached.timestamp) < this.TOOL_CACHE_TTL) {
          // Cache hit
          results.push({ ...cached.result, cached: true } as ToolResult);
          this.metrics.toolSuccesses++;
        } else {
          uncachedCalls.push(call);
        }
      }

      // Execute uncached calls
      if (uncachedCalls.length > 0) {
        const dispatchResult = await this.dispatcher.dispatch(uncachedCalls);

        for (const r of dispatchResult.results) {
          const result: ToolResult = {
            name: r.name,
            success: r.success,
            data: r.data,
            error: r.error,
            duration: r.duration,
          };
          results.push(result);

          // v8.2: Cache successful results
          if (r.success) {
            const cacheKey = this.getToolCacheKey({ name: r.name, arguments: {} });
            this.toolCache.set(cacheKey, { result, timestamp: Date.now() });
            this.metrics.toolSuccesses++;
          } else {
            this.metrics.toolFailures++;
          }
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
   * v8.2: Clean expired entries from tool cache
   */
  private cleanToolCache(): void {
    const now = Date.now();

    // Remove expired entries
    for (const [key, entry] of this.toolCache.entries()) {
      if (now - entry.timestamp > this.TOOL_CACHE_TTL) {
        this.toolCache.delete(key);
      }
    }

    // Enforce max size (LRU-style: remove oldest entries)
    if (this.toolCache.size > this.TOOL_CACHE_MAX_SIZE) {
      const entries = Array.from(this.toolCache.entries())
        .sort((a, b) => a[1].timestamp - b[1].timestamp);

      const toRemove = entries.slice(0, this.toolCache.size - this.TOOL_CACHE_MAX_SIZE);
      for (const [key] of toRemove) {
        this.toolCache.delete(key);
      }
    }
  }

  /**
   * v8.2: Generate cache key from tool call
   */
  private getToolCacheKey(call: { name: string; arguments?: unknown }): string {
    const argsStr = call.arguments ? JSON.stringify(call.arguments) : '';
    return `${call.name}:${argsStr}`;
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
   * v7.13: Full multi-agent coordination via Kernel state machine
   */
  private async stepKernel(state: BrainState): Promise<Command> {
    if (!this.kernel) {
      return {
        goto: 'llm',
        update: {},
        reason: 'kernel_not_available',
      };
    }

    try {
      // Use coordinatedTask for multi-agent processing
      const result = await this.kernel.coordinatedTask({
        query: state.query,
        pattern: 'parallel',  // Run agents in parallel by default
        timeout: 60000,       // 1 minute timeout
      });

      // Result is unknown type, try to extract useful info
      if (result !== null && result !== undefined) {
        const resultStr = typeof result === 'string'
          ? result
          : JSON.stringify(result, null, 2);

        // If result is substantial, use it as response
        if (resultStr.length > 10) {
          return {
            goto: 'done',
            update: { response: resultStr },
            reason: 'kernel_complete',
          };
        }

        // Add to context for LLM processing
        return {
          goto: 'llm',
          update: {
            context: {
              ...state.context,
              formatted: state.context.formatted + `\n\n[Kernel Result: ${resultStr.slice(0, 500)}]`,
            },
          },
          reason: 'kernel_delegated',
        };
      }

      // No result, passthrough to LLM
      return {
        goto: 'llm',
        update: {},
        reason: 'kernel_passthrough',
      };
    } catch (error) {
      return {
        goto: 'llm',
        update: {},
        reason: `kernel_error: ${error instanceof Error ? error.message : 'unknown'}`,
      };
    }
  }

  // ============================================================================
  // v7.13: New Module Step Methods
  // ============================================================================

  /**
   * Active Inference module: Free Energy minimization and action selection
   * Based on: Active Inference framework - minimizes prediction error
   */
  private async stepActiveInference(state: BrainState): Promise<Command> {
    if (!this.activeInference) {
      return {
        goto: 'thinking',
        update: {},
        reason: 'active_inference_not_available',
      };
    }

    try {
      // Get consciousness level for monitoring
      const phi = this.getCurrentPhi();

      // Run single active inference cycle
      const actionType = await this.activeInference.cycle();
      const beliefs = this.activeInference.getBeliefs();

      // Get stats for monitoring
      const stats = this.activeInference.getStats();

      // Route based on action type from active inference
      // v7.18: Comprehensive routing for all action types

      // Memory-related actions
      if (actionType === 'recall.memory' || actionType === 'dream.cycle' || actionType === 'code.history') {
        // Trigger memory anticipation based on active inference predictions
        try {
          const anticipated = await this.workspace.anticipate({
            task: state.query,
            keywords: state.query.split(/\s+/).filter(w => w.length > 3),
          });
          if (anticipated.length > 0) {
            this.metrics.anticipationHits += anticipated.length;
          }
        } catch {
          // Memory anticipation failure is non-fatal
        }

        return {
          goto: 'memory',
          update: {
            phi,
            context: {
              ...state.context,
              formatted: state.context.formatted + `\n\n[Active Inference: memory recall suggested (surprise: ${stats.avgSurprise.toFixed(2)})]`,
            },
          },
          reason: 'active_inference_recall',
        };
      }

      // Tool execution actions (MCP, web, deployment, etc.)
      const toolActions = [
        'execute.task', 'execute.code', 'execute.shell', 'execute.cycle', 'adapt.code',
        'sense.mcp', 'web.search', 'web.scrape', 'web.browse',
        'deploy.service', 'content.generate', 'api.call', 'github.deploy',
      ];
      if (toolActions.includes(actionType)) {
        return {
          goto: 'tools',
          update: { phi },
          reason: `active_inference_tool:${actionType}`,
        };
      }

      // Self-modification actions - route to darwin-godel
      if (actionType === 'self.modify' || actionType === 'self.analyze' || actionType === 'code.snapshot' || actionType === 'code.diff') {
        return {
          goto: 'self-modify',
          update: { phi },
          reason: 'active_inference_self_modify',
        };
      }

      // Rest actions - skip to response (energy conservation)
      if (actionType === 'rest.idle' || actionType === 'recharge') {
        return {
          goto: 'llm',
          update: { phi },
          reason: 'active_inference_rest',
        };
      }

      // Default: proceed to thinking with beliefs context
      const beliefsSummary = Object.entries(beliefs)
        .slice(0, 3)
        .map(([k, v]) => `${k}: ${typeof v === 'number' ? v.toFixed(2) : v}`)
        .join(', ');

      return {
        goto: 'thinking',
        update: {
          phi,
          context: {
            ...state.context,
            formatted: state.context.formatted + `\n\n[Active Inference: ${beliefsSummary}]`,
          },
        },
        reason: 'active_inference_think',
      };
    } catch (error) {
      return {
        goto: 'thinking',
        update: {},
        reason: `active_inference_error: ${error instanceof Error ? error.message : 'unknown'}`,
      };
    }
  }

  /**
   * Subagents module: delegate to specialized subagents
   * Routes complex tasks to specialized agents (explore, plan, code, research, general)
   */
  private async stepSubagents(state: BrainState): Promise<Command> {
    if (!this.subagentExecutor) {
      return {
        goto: 'llm',
        update: {},
        reason: 'subagents_not_available',
      };
    }

    try {
      // Determine appropriate subagent based on query analysis
      const queryLower = state.query.toLowerCase();
      let subagentType: 'explore' | 'plan' | 'code' | 'research' | 'general' = 'general';

      if (queryLower.includes('plan') || queryLower.includes('design') || queryLower.includes('architect')) {
        subagentType = 'plan';
      } else if (queryLower.includes('implement') || queryLower.includes('build') || queryLower.includes('code') || queryLower.includes('write')) {
        subagentType = 'code';
      } else if (queryLower.includes('explore') || queryLower.includes('search') || queryLower.includes('find')) {
        subagentType = 'explore';
      } else if (queryLower.includes('research') || queryLower.includes('learn') || queryLower.includes('study')) {
        subagentType = 'research';
      }

      // Execute subagent with correct TaskRequest interface
      const result = await this.subagentExecutor.execute({
        description: `Brain ${subagentType} task`,
        prompt: `${state.context.formatted ? `Context:\n${state.context.formatted}\n\n` : ''}Task: ${state.query}`,
        subagentType,
        model: 'balanced',
      });

      if (result.success && result.result) {
        return {
          goto: 'done',
          update: { response: result.result },
          reason: `subagent_${subagentType}_complete`,
        };
      }

      // Subagent failed or no result
      return {
        goto: 'llm',
        update: {
          context: {
            ...state.context,
            formatted: state.context.formatted + `\n\n[Subagent ${subagentType}: ${result.error || 'no result'}]`,
          },
        },
        reason: 'subagent_fallback',
      };
    } catch (error) {
      return {
        goto: 'llm',
        update: {},
        reason: `subagents_error: ${error instanceof Error ? error.message : 'unknown'}`,
      };
    }
  }

  /**
   * World Model module: predictive modeling and simulation
   * Based on: Value-Guided JEPA from arXiv:2501.01223
   */
  private async stepWorldModel(state: BrainState): Promise<Command> {
    if (!this.worldModel) {
      return {
        goto: 'llm',
        update: {},
        reason: 'world_model_not_available',
      };
    }

    try {
      // Encode current state as text modality
      const encoded = this.worldModel.encode({
        modality: 'text',
        data: `Query: ${state.query}\nContext: ${state.context.formatted || 'none'}\nResponse: ${state.response || 'pending'}`,
        timestamp: new Date(),
      });

      // Create a simple action for prediction
      // ActionType: 'observe' | 'query' | 'execute' | 'communicate' | 'transform' | 'create' | 'delete' | 'navigate'
      const queryAction = {
        id: `query-${Date.now()}`,
        type: 'query' as const,
        parameters: { goal: state.query },
        agent: 'brain',
        timestamp: new Date(),
      };

      // Predict next state given query action
      const prediction = this.worldModel.predict(encoded, queryAction);

      // Create action sequence for simulation
      const actions = [queryAction];

      // Simulate trajectory
      const trajectory = this.worldModel.simulate(encoded, actions, 3);

      // Extract useful info from trajectory
      const predictionInfo = prediction
        ? `probability: ${(prediction.probability * 100).toFixed(0)}%, uncertainty: ${(prediction.uncertainty * 100).toFixed(0)}%`
        : 'no prediction';

      const trajectoryInfo = trajectory
        ? `steps: ${trajectory.states.length}, total probability: ${(trajectory.totalProbability * 100).toFixed(0)}%`
        : 'no trajectory';

      return {
        goto: 'llm',
        update: {
          context: {
            ...state.context,
            formatted: state.context.formatted + `\n\n[World Model: ${predictionInfo}, ${trajectoryInfo}]`,
          },
        },
        reason: 'world_model_simulated',
      };
    } catch (error) {
      return {
        goto: 'llm',
        update: {},
        reason: `world_model_error: ${error instanceof Error ? error.message : 'unknown'}`,
      };
    }
  }

  /**
   * Self-Modify module: Darwin-Gödel safe self-improvement
   * Only triggered explicitly when improvement is requested
   * Self-modification requires explicit plan - this module validates and applies
   */
  private async stepSelfModify(state: BrainState): Promise<Command> {
    if (!this.darwinGodel) {
      return {
        goto: 'done',
        update: {},
        reason: 'self_modify_not_available',
      };
    }

    try {
      // v8.4: Use Active Inference action executors for self-modification
      const queryLower = state.query.toLowerCase();

      // Determine which action to invoke based on query
      const isExplicitModify = queryLower.includes('self-modify') ||
        queryLower.includes('self modify') ||
        queryLower.includes('modifica te stesso');
      const isImproveRequest = queryLower.includes('improve') ||
        queryLower.includes('optimize') ||
        queryLower.includes('miglior');

      if (!isExplicitModify && !isImproveRequest) {
        // Not a self-modification request, skip
        return {
          goto: 'done',
          update: {},
          reason: 'self_modify_not_requested',
        };
      }

      // Import action executor dynamically to avoid circular deps
      const { executeAction } = await import('../active-inference/actions.js');

      // Check consciousness level first
      const phi = this.phiMonitor?.getCurrentLevel().phi ?? 0;
      if (phi < 0.3) {
        return {
          goto: 'done',
          update: {
            response: `[Self-modification blocked: consciousness level φ=${phi.toFixed(3)} < 0.3 required]`,
          },
          reason: 'self_modify_phi_too_low',
        };
      }

      // Default beliefs for Active Inference context
      const defaultBeliefs = { viability: 0.5, worldState: 0.5, coupling: 0.5, goalProgress: 0.5 };

      // Execute the appropriate action
      let result;
      if (isExplicitModify) {
        // Direct modification - extract target metric if specified
        const metricMatch = queryLower.match(/(?:metric|metrica)[:\s]+(\w+)/);
        const targetMetric = metricMatch ? metricMatch[1] : undefined;

        result = await executeAction('self.modify' as any, {
          parameters: targetMetric ? { targetMetric } : {},
          beliefs: defaultBeliefs,
        });
      } else {
        // Improvement discovery
        const autoApply = queryLower.includes('auto') || queryLower.includes('applica');

        result = await executeAction('improve.self' as any, {
          parameters: { autoApply },
          beliefs: defaultBeliefs,
        });
      }

      // Format response based on result
      let response: string;
      if (result.success) {
        if (result.data?.message) {
          response = result.data.message;
        } else if (result.data?.opportunities) {
          response = [
            `Found ${result.data.opportunities.length} improvement opportunities:`,
            ...result.data.opportunities.slice(0, 5).map((o: any, i: number) =>
              `${i + 1}. [${o.category}] ${o.metric}: ${o.description} (priority: ${o.priority})`
            ),
            result.data.hint || '',
          ].join('\n');
        } else if (result.data?.applied) {
          response = `Applied ${result.data.improvements?.length || 0} improvements.`;
        } else {
          response = `Self-modification completed: ${JSON.stringify(result.data)}`;
        }
      } else {
        response = `Self-modification failed: ${result.error}`;
      }

      return {
        goto: 'done',
        update: { response },
        reason: result.success ? 'self_modify_success' : 'self_modify_failed',
      };
    } catch (error) {
      return {
        goto: 'done',
        update: {
          response: `[Self-modification error: ${error instanceof Error ? error.message : 'unknown'}]`,
        },
        reason: `self_modify_error: ${error instanceof Error ? error.message : 'unknown'}`,
      };
    }
  }

  /**
   * Organism module: autopoietic lifecycle management
   * Manages system health, resource allocation, and self-maintenance
   */
  private async stepOrganism(state: BrainState): Promise<Command> {
    // Organism module handles system-level health checks
    const phi = this.getCurrentPhi();
    const memoryMetrics = this.workspace.getMetrics();

    // Check system health
    const healthStatus = {
      consciousness: phi >= this.config.consciousness.phiThreshold,
      memoryHealth: memoryMetrics.reuseRate >= 0.3,
      errorRate: this.metrics.failedCycles / Math.max(this.metrics.totalCycles, 1) < 0.1,
    };

    const allHealthy = Object.values(healthStatus).every(v => v);

    if (!allHealthy) {
      // Trigger healing if unhealthy
      const unhealthyAspects = Object.entries(healthStatus)
        .filter(([_, healthy]) => !healthy)
        .map(([aspect]) => aspect);

      return {
        goto: 'healing',
        update: {
          error: new Error(`Organism health check failed: ${unhealthyAspects.join(', ')}`),
        },
        reason: 'organism_unhealthy',
      };
    }

    // Trigger auto-persistence if stateStore available
    if (this.stateStore && state.response) {
      try {
        // Update session state with health check info
        const currentState = this.stateStore.getState();
        this.stateStore.update({
          session: {
            id: currentState.session?.id || `organism-${Date.now()}`,
            startTime: currentState.session?.startTime || new Date(),
            interactions: this.metrics.totalCycles,
            lastActivity: new Date(),
          },
        });
        await this.stateStore.save();
      } catch {
        // Persistence failure is non-fatal
      }
    }

    return {
      goto: 'done',
      update: { phi },
      reason: 'organism_healthy',
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
   * v8.1: Also persist metrics to disk
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

    // v8.1: Persist metrics and phi to disk
    this.persistence.updateMetrics({
      totalCycles: 1,
      successfulCycles: state.error ? 0 : 1,
      failedCycles: state.error ? 1 : 0,
      avgCycleTime: cycleTime,
      memoryRecalls: state.context.immediate.length + state.context.episodic.length,
      toolExecutions: state.toolResults.length,
      toolSuccesses: state.toolResults.filter(r => r.success).length,
      toolFailures: state.toolResults.filter(r => !r.success).length,
      healingAttempts: state.healingAttempts,
    });
    this.persistence.recordPhi(state.phi, state.query.slice(0, 50));
    if (state.ignited) {
      this.persistence.recordBroadcast();
    }
    this.persistence.save();
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
   * v8.1: Includes persisted consciousness stats
   */
  getStatus(): {
    running: boolean;
    phi: number;
    memoryReuseRate: number;
    lastState: BrainState | null;
    metrics: BrainMetrics;
    moduleStates: Record<string, boolean>;
    persisted: {
      peakPhi: number;
      avgPhi: number;
      totalIgnitions: number;
      totalBroadcasts: number;
      totalSessions: number;
      totalUptime: number;
    };
  } {
    const consciousnessStats = this.persistence.getConsciousnessStats();
    const persistedState = this.persistence.getState();

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
        // v7.13: New module states
        activeInference: this.activeInference !== null,
        subagents: this.subagentExecutor !== null,
        kernel: this.kernel !== null,
        persistence: this.stateStore !== null,
        worldModel: this.worldModel !== null,
        selfModify: this.darwinGodel !== null,
      },
      // v8.1: Persisted stats across sessions
      persisted: {
        peakPhi: consciousnessStats.peakPhi,
        avgPhi: consciousnessStats.avgPhi,
        totalIgnitions: consciousnessStats.totalIgnitions,
        totalBroadcasts: consciousnessStats.totalBroadcasts,
        totalSessions: persistedState.sessions.total,
        totalUptime: persistedState.sessions.totalUptime,
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
