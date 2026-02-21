/**
 * Genesis v35 — Canonical Agent Loop
 *
 * The explicit decision cycle that every cognitive architecture converges on:
 *   perceive → reason → select → execute → observe → learn
 *
 * Based on:
 * - CoALA (Sumers et al., TMLR 2024): Working memory + LTM trifecta + decision cycle
 * - LIDA (Franklin 2006): Understanding → Consciousness → Action Selection
 * - Standard Model of the Mind (Laird/Lebiere/Rosenbloom 2017)
 * - SOAR: Impasse-driven decomposition
 *
 * This replaces the implicit event-driven flow in genesis.ts with a traceable,
 * testable, debuggable loop. The FEK is integrated INTO the loop, not called
 * once outside it.
 *
 * Usage:
 *   const loop = new AgentLoop({ fek, memory, tools, reasoning });
 *   const result = await loop.run(input);
 */

import { createPublisher } from '../bus/index.js';

// ============================================================================
// Types
// ============================================================================

/** A single step in the agent's working memory */
export interface WorkingMemoryItem {
  id: string;
  type: 'perception' | 'retrieval' | 'reasoning' | 'action_result' | 'goal';
  content: string;
  salience: number;    // 0-1: how important (bottom-up)
  relevance: number;   // 0-1: how relevant to current goal (top-down)
  timestamp: number;
  source: string;
  decay: number;       // ACT-R style decay rate
}

/** The agent's complete state at any point in the loop */
export interface AgentState {
  /** Original input */
  input: string;
  /** Current goal being pursued */
  goal: string;
  /** Working memory (limited capacity, decaying) */
  workingMemory: WorkingMemoryItem[];
  /** Accumulated response */
  response: string;
  /** Current phase of the cycle */
  phase: CyclePhase;
  /** Free energy (from FEK) — drives strategy selection */
  freeEnergy: number;
  /** Precision-weighted confidence */
  confidence: number;
  /** Strategy selected by FEK L3 */
  strategy: string;
  /** Tools used this cycle */
  toolsUsed: string[];
  /** Number of cycles completed */
  cycleCount: number;
  /** Total elapsed time (ms) */
  elapsed: number;
  /** Whether the loop should terminate */
  done: boolean;
  /** Error if any */
  error?: Error;
  /** Metadata for extensibility */
  meta: Record<string, unknown>;
}

export type CyclePhase =
  | 'perceive'    // Gather observations, update working memory
  | 'retrieve'    // Pull relevant memories (episodic, semantic, procedural)
  | 'reason'      // FEK cycle + strategy selection + reasoning
  | 'select'      // Choose action (tool call, response, delegation)
  | 'execute'     // Execute the selected action
  | 'observe'     // Process action result, compute prediction error
  | 'learn'       // Update long-term memory with outcomes
  | 'done';       // Terminal state

/** Action proposed during the select phase */
export interface ProposedAction {
  type: 'tool_call' | 'respond' | 'delegate' | 'retrieve' | 'reason_deeper' | 'terminate';
  tool?: string;
  params?: Record<string, unknown>;
  response?: string;
  subagent?: string;
  confidence: number;
  rationale: string;
}

/** Result of executing an action */
export interface ActionResult {
  success: boolean;
  output: string;
  cost: number;
  latencyMs: number;
  predictionError: number;  // How surprising was this result? (0-1)
}

/** Pluggable modules that the agent loop calls */
export interface AgentModules {
  /** Perceive: gather context from input + environment */
  perceive: (state: AgentState) => Promise<WorkingMemoryItem[]>;
  /** Retrieve: search long-term memory */
  retrieve: (state: AgentState) => Promise<WorkingMemoryItem[]>;
  /** Reason: run FEK cycle, select strategy, generate reasoning */
  reason: (state: AgentState) => Promise<{
    freeEnergy: number;
    strategy: string;
    confidence: number;
    reasoning: string;
  }>;
  /** Select: propose an action */
  select: (state: AgentState) => Promise<ProposedAction>;
  /** Execute: carry out the selected action */
  execute: (state: AgentState, action: ProposedAction) => Promise<ActionResult>;
  /** Observe: process action result, compute prediction error */
  observe: (state: AgentState, result: ActionResult) => Promise<WorkingMemoryItem[]>;
  /** Learn: update long-term memory (optional) */
  learn?: (state: AgentState) => Promise<void>;
  /** Should the loop terminate? */
  shouldTerminate: (state: AgentState) => boolean;
}

/** Configuration for the agent loop */
export interface AgentLoopConfig {
  /** Maximum number of cycles before forced termination */
  maxCycles: number;
  /** Maximum elapsed time (ms) before timeout */
  maxTimeMs: number;
  /** Working memory capacity (items) */
  workingMemoryCapacity: number;
  /** Working memory decay rate per cycle */
  decayRate: number;
  /** Minimum salience to keep in working memory */
  salienceThreshold: number;
  /** Free energy threshold below which we consider the task "solved" */
  feSolvedThreshold: number;
  /** Enable bus event publishing */
  publishEvents: boolean;
}

export const DEFAULT_AGENT_LOOP_CONFIG: AgentLoopConfig = {
  maxCycles: 20,
  maxTimeMs: 30000,          // 30s
  workingMemoryCapacity: 7,  // Miller's number
  decayRate: 0.1,
  salienceThreshold: 0.15,
  feSolvedThreshold: 0.1,
  publishEvents: true,
};

/** Result returned by the agent loop */
export interface AgentLoopResult {
  response: string;
  confidence: number;
  freeEnergy: number;
  strategy: string;
  cycleCount: number;
  elapsedMs: number;
  toolsUsed: string[];
  workingMemoryFinal: WorkingMemoryItem[];
  phaseHistory: CyclePhase[];
  error?: Error;
}

// ============================================================================
// Agent Loop
// ============================================================================

export class AgentLoop {
  private config: AgentLoopConfig;
  private modules: AgentModules;
  private publisher = createPublisher('agent-loop');

  constructor(modules: AgentModules, config: Partial<AgentLoopConfig> = {}) {
    this.config = { ...DEFAULT_AGENT_LOOP_CONFIG, ...config };
    this.modules = modules;
  }

  /**
   * Run the full agent loop on an input.
   *
   * The canonical cycle:
   * 1. PERCEIVE: gather observations, build situational model
   * 2. RETRIEVE: search episodic/semantic/procedural memory
   * 3. REASON: FEK cycle → strategy selection → generate reasoning
   * 4. SELECT: propose action (tool call, response, delegation)
   * 5. EXECUTE: carry out the action
   * 6. OBSERVE: process result, compute prediction error
   * 7. LEARN: update long-term memory
   * 8. Check termination → repeat or exit
   */
  async run(input: string): Promise<AgentLoopResult> {
    const startTime = Date.now();
    const phaseHistory: CyclePhase[] = [];

    let state: AgentState = {
      input,
      goal: input,
      workingMemory: [],
      response: '',
      phase: 'perceive',
      freeEnergy: 1.0,  // Start with high FE (uncertain)
      confidence: 0.0,
      strategy: 'sequential',
      toolsUsed: [],
      cycleCount: 0,
      elapsed: 0,
      done: false,
      meta: {},
    };

    this.publishEvent('loop.started', { input, config: this.config });

    try {
      while (!state.done && state.cycleCount < this.config.maxCycles) {
        state.elapsed = Date.now() - startTime;

        // Timeout check
        if (state.elapsed > this.config.maxTimeMs) {
          state.done = true;
          state.error = new Error(`Agent loop timeout after ${state.elapsed}ms`);
          break;
        }

        state.cycleCount++;
        this.publishEvent('cycle.started', { cycle: state.cycleCount, fe: state.freeEnergy });

        // --- PHASE 1: PERCEIVE ---
        state.phase = 'perceive';
        phaseHistory.push('perceive');
        const perceptions = await this.modules.perceive(state);
        this.addToWorkingMemory(state, perceptions);

        // --- PHASE 2: RETRIEVE ---
        state.phase = 'retrieve';
        phaseHistory.push('retrieve');
        const memories = await this.modules.retrieve(state);
        this.addToWorkingMemory(state, memories);

        // --- PHASE 3: REASON ---
        state.phase = 'reason';
        phaseHistory.push('reason');
        const reasoning = await this.modules.reason(state);
        state.freeEnergy = reasoning.freeEnergy;
        state.strategy = reasoning.strategy;
        state.confidence = reasoning.confidence;

        // Add reasoning to working memory
        this.addToWorkingMemory(state, [{
          id: `reasoning-${state.cycleCount}`,
          type: 'reasoning',
          content: reasoning.reasoning,
          salience: reasoning.confidence,
          relevance: 1.0,
          timestamp: Date.now(),
          source: `reason:${reasoning.strategy}`,
          decay: 0.05,
        }]);

        // Check if FE is low enough to terminate (task "solved")
        if (state.freeEnergy < this.config.feSolvedThreshold && state.response) {
          state.done = true;
          this.publishEvent('fe.solved', { fe: state.freeEnergy, threshold: this.config.feSolvedThreshold });
          break;
        }

        // --- PHASE 4: SELECT ---
        state.phase = 'select';
        phaseHistory.push('select');
        const action = await this.modules.select(state);

        // Handle terminate action
        if (action.type === 'terminate') {
          if (action.response) state.response = action.response;
          state.done = true;
          break;
        }

        // --- PHASE 5: EXECUTE ---
        state.phase = 'execute';
        phaseHistory.push('execute');
        const result = await this.modules.execute(state, action);

        if (action.type === 'respond' && action.response) {
          state.response = action.response;
        }
        if (action.type === 'tool_call' && action.tool) {
          state.toolsUsed.push(action.tool);
        }

        // --- PHASE 6: OBSERVE ---
        state.phase = 'observe';
        phaseHistory.push('observe');
        const observations = await this.modules.observe(state, result);
        this.addToWorkingMemory(state, observations);

        // Update response from action result if relevant
        if (result.success && result.output && action.type !== 'respond') {
          // Tool/retrieval results go into working memory, not directly to response
          this.addToWorkingMemory(state, [{
            id: `result-${state.cycleCount}`,
            type: 'action_result',
            content: result.output,
            salience: 1 - result.predictionError,
            relevance: 0.9,
            timestamp: Date.now(),
            source: action.tool || action.type,
            decay: 0.1,
          }]);
        }

        // --- PHASE 7: LEARN ---
        if (this.modules.learn) {
          state.phase = 'learn' as CyclePhase;
          await this.modules.learn(state);
        }

        // --- DECAY & PRUNE WORKING MEMORY ---
        this.decayWorkingMemory(state);

        // --- CHECK TERMINATION ---
        if (this.modules.shouldTerminate(state)) {
          state.done = true;
        }

        this.publishEvent('cycle.completed', {
          cycle: state.cycleCount,
          fe: state.freeEnergy,
          strategy: state.strategy,
          confidence: state.confidence,
          action: action.type,
          wmSize: state.workingMemory.length,
        });
      }
    } catch (error) {
      state.error = error instanceof Error ? error : new Error(String(error));
      this.publishEvent('loop.error', { error: state.error.message, cycle: state.cycleCount });
    }

    state.elapsed = Date.now() - startTime;

    this.publishEvent('loop.completed', {
      cycles: state.cycleCount,
      elapsed: state.elapsed,
      fe: state.freeEnergy,
      confidence: state.confidence,
      response: state.response.substring(0, 200),
    });

    return {
      response: state.response,
      confidence: state.confidence,
      freeEnergy: state.freeEnergy,
      strategy: state.strategy,
      cycleCount: state.cycleCount,
      elapsedMs: state.elapsed,
      toolsUsed: state.toolsUsed,
      workingMemoryFinal: state.workingMemory,
      phaseHistory,
      error: state.error,
    };
  }

  // ==========================================================================
  // Working Memory Management (ACT-R inspired)
  // ==========================================================================

  /**
   * Add items to working memory, respecting capacity limits.
   * Items with highest combined salience + relevance are kept.
   */
  private addToWorkingMemory(state: AgentState, items: WorkingMemoryItem[]): void {
    state.workingMemory.push(...items);

    // Sort by combined score (salience + relevance), keep top N
    if (state.workingMemory.length > this.config.workingMemoryCapacity) {
      state.workingMemory.sort((a, b) => {
        const scoreA = a.salience * 0.6 + a.relevance * 0.4;
        const scoreB = b.salience * 0.6 + b.relevance * 0.4;
        return scoreB - scoreA;
      });
      state.workingMemory = state.workingMemory.slice(0, this.config.workingMemoryCapacity);
    }
  }

  /**
   * Apply decay to working memory items. Remove items below threshold.
   * ACT-R: activation decays with time, boosted by use.
   */
  private decayWorkingMemory(state: AgentState): void {
    for (const item of state.workingMemory) {
      item.salience *= (1 - item.decay);
    }
    state.workingMemory = state.workingMemory.filter(
      item => item.salience >= this.config.salienceThreshold
    );
  }

  // ==========================================================================
  // Bus Events
  // ==========================================================================

  private publishEvent(topic: string, data: Record<string, unknown>): void {
    if (!this.config.publishEvents) return;
    try {
      this.publisher.publish(`agent-loop.${topic}` as any, {
        source: 'agent-loop',
        precision: 0.8,
        ...data,
      });
    } catch {
      // Bus not available — non-fatal
    }
  }
}

// ============================================================================
// Factory: Create AgentModules from existing Genesis components
// ============================================================================

/**
 * Create AgentModules that bridge to existing Genesis systems.
 * This is the adapter layer between the clean agent loop and
 * Genesis's existing singletons.
 */
export function createGenesisModules(deps: {
  fek?: { cycle: (obs: any) => any; getTotalFE?: () => number };
  memory?: { recall: (query: string) => Promise<any[]> };
  tools?: Map<string, { execute: (params: any) => Promise<any> }>;
  reasoning?: { reason: (input: string, context?: string) => Promise<any> };
  brain?: { process: (input: string, context?: any) => Promise<string> };
}): AgentModules {
  return {
    perceive: async (state) => {
      // First cycle: input is the perception
      if (state.cycleCount <= 1) {
        return [{
          id: 'input-perception',
          type: 'perception' as const,
          content: state.input,
          salience: 1.0,
          relevance: 1.0,
          timestamp: Date.now(),
          source: 'user',
          decay: 0.02,
        }];
      }
      return [];
    },

    retrieve: async (state) => {
      if (!deps.memory) return [];
      try {
        const results = await deps.memory.recall(state.goal);
        return (results || []).slice(0, 3).map((r: any, i: number) => ({
          id: `memory-${state.cycleCount}-${i}`,
          type: 'retrieval' as const,
          content: typeof r === 'string' ? r : r.content || r.what || JSON.stringify(r),
          salience: r.relevance || 0.7,
          relevance: r.relevance || 0.7,
          timestamp: Date.now(),
          source: 'memory',
          decay: 0.08,
        }));
      } catch {
        return [];
      }
    },

    reason: async (state) => {
      // Run FEK cycle if available
      let freeEnergy = state.freeEnergy;
      let strategy = 'sequential';

      if (deps.fek) {
        try {
          const fekState = deps.fek.cycle({
            energy: 1.0,
            agentResponsive: true,
            merkleValid: true,
            systemLoad: state.toolsUsed.length / 5,
            phi: state.confidence,
          });
          freeEnergy = fekState.totalFE ?? deps.fek.getTotalFE?.() ?? state.freeEnergy;
          strategy = fekState.strategy || 'sequential';
        } catch {
          // FEK not available
        }
      }

      // Adjust confidence based on working memory
      const wmConfidence = state.workingMemory.length > 0
        ? state.workingMemory.reduce((s, i) => s + i.salience, 0) / state.workingMemory.length
        : 0.3;

      return {
        freeEnergy,
        strategy,
        confidence: Math.min(0.99, wmConfidence * 0.7 + state.confidence * 0.3),
        reasoning: `FE=${freeEnergy.toFixed(3)}, strategy=${strategy}, WM=${state.workingMemory.length}`,
      };
    },

    select: async (state) => {
      // If we already have a response with good confidence, terminate
      if (state.response && state.confidence > 0.7) {
        return {
          type: 'terminate',
          confidence: state.confidence,
          rationale: 'Response ready with sufficient confidence',
        };
      }

      // If no response yet, delegate to brain
      if (!state.response) {
        return {
          type: 'respond',
          confidence: 0.5,
          rationale: 'Need to generate response',
        };
      }

      // Default: terminate with current response
      return {
        type: 'terminate',
        response: state.response,
        confidence: state.confidence,
        rationale: 'Default termination',
      };
    },

    execute: async (state, action) => {
      const start = Date.now();

      if (action.type === 'respond' && deps.brain) {
        try {
          const context = state.workingMemory
            .filter(i => i.type === 'retrieval' || i.type === 'perception')
            .map(i => i.content)
            .join('\n');

          const response = await deps.brain.process(state.input, {
            workspaceItems: state.workingMemory.map(i => ({
              type: i.type === 'retrieval' ? 'semantic' : 'task',
              content: i.content,
              relevance: i.relevance,
              source: i.source,
            })),
          });

          state.response = response;

          return {
            success: true,
            output: response,
            cost: 0,
            latencyMs: Date.now() - start,
            predictionError: 0.1,
          };
        } catch (err) {
          return {
            success: false,
            output: err instanceof Error ? err.message : String(err),
            cost: 0,
            latencyMs: Date.now() - start,
            predictionError: 0.9,
          };
        }
      }

      if (action.type === 'tool_call' && action.tool && deps.tools) {
        const tool = deps.tools.get(action.tool);
        if (tool) {
          try {
            const result = await tool.execute(action.params || {});
            return {
              success: true,
              output: typeof result === 'string' ? result : JSON.stringify(result),
              cost: 0,
              latencyMs: Date.now() - start,
              predictionError: 0.2,
            };
          } catch (err) {
            return {
              success: false,
              output: err instanceof Error ? err.message : String(err),
              cost: 0,
              latencyMs: Date.now() - start,
              predictionError: 0.8,
            };
          }
        }
      }

      return {
        success: true,
        output: '',
        cost: 0,
        latencyMs: Date.now() - start,
        predictionError: 0,
      };
    },

    observe: async (state, result) => {
      // Compute prediction error for FEK feedback
      if (result.predictionError > 0.5) {
        return [{
          id: `surprise-${state.cycleCount}`,
          type: 'perception' as const,
          content: `High prediction error (${result.predictionError.toFixed(2)}): ${result.output.substring(0, 200)}`,
          salience: result.predictionError,
          relevance: 0.8,
          timestamp: Date.now(),
          source: 'observation',
          decay: 0.05,
        }];
      }
      return [];
    },

    shouldTerminate: (state) => {
      // Terminate when response exists and FE is low
      if (state.response && state.freeEnergy < 0.3) return true;
      // Terminate when response exists and confidence is high
      if (state.response && state.confidence > 0.7) return true;
      // Don't loop forever with a response
      if (state.response && state.cycleCount >= 2) return true;
      return false;
    },
  };
}
