/**
 * Genesis 7.16 - Conscious Agent
 *
 * Unified orchestration of consciousness, perception, memory, and action.
 *
 * Architecture:
 * ```
 *                     ┌─────────────────────────────────────┐
 *                     │          CONSCIOUS AGENT            │
 *                     └─────────────────────────────────────┘
 *                                      │
 *          ┌───────────────────────────┼───────────────────────────┐
 *          │                           │                           │
 *          ▼                           ▼                           ▼
 * ┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐
 * │   PERCEPTION    │       │   COGNITION     │       │    ACTION       │
 * │    STREAM       │       │                 │       │   SELECTION     │
 * │                 │       │  ┌───────────┐  │       │                 │
 * │  MCP Inputs:    │──────▶│  │ Cognitive │  │──────▶│  MCP Outputs:   │
 * │  - Search       │       │  │ Workspace │  │       │  - GitHub       │
 * │  - ArXiv        │       │  └───────────┘  │       │  - AWS          │
 * │  - Memory       │       │        │        │       │  - Filesystem   │
 * │  - Filesystem   │       │        ▼        │       │  - Stability    │
 * │                 │       │  ┌───────────┐  │       │                 │
 * └─────────────────┘       │  │  Global   │  │       └─────────────────┘
 *                           │  │ Workspace │  │
 *          ┌────────────────│  └───────────┘  │────────────────┐
 *          │                │        │        │                │
 *          ▼                │        ▼        │                ▼
 * ┌─────────────────┐       │  ┌───────────┐  │       ┌─────────────────┐
 * │   PHI MONITOR   │◀──────│  │   Active  │  │──────▶│    MEMORY       │
 * │                 │       │  │ Inference │  │       │    SYSTEM       │
 * │  - IIT φ calc   │       │  └───────────┘  │       │                 │
 * │  - Integration  │       │                 │       │  - Episodic     │
 * │  - Anomalies    │       └─────────────────┘       │  - Semantic     │
 * │                 │                                 │  - Procedural   │
 * └─────────────────┘                                 └─────────────────┘
 * ```
 *
 * The ConsciousAgent:
 * 1. Receives perceptions from MCP servers
 * 2. Integrates them in the CognitiveWorkspace
 * 3. Competes for conscious access in GlobalWorkspace
 * 4. Monitors integration via φ (PhiMonitor)
 * 5. Selects actions via Active Inference to minimize free energy
 * 6. Executes actions through MCP servers
 */

import { EventEmitter } from 'events';
import { MCPClientManager, MCPTool } from '../mcp/client-manager.js';
import {
  ConsciousnessSystem,
  createConsciousnessSystem,
  ConsciousnessSnapshot,
  ConsciousnessState,
} from './index.js';
import {
  PerceptionStream,
  createPerceptionStream,
  Perception,
  PerceptionCategory,
} from './perception-stream.js';
import {
  CognitiveWorkspace,
  createCognitiveWorkspace,
  WorkingMemoryItem,
} from '../memory/cognitive-workspace.js';
import { SystemState, ComponentState, Connection } from './types.js';
import { createHash } from 'crypto';

// ============================================================================
// Types
// ============================================================================

export interface ActionCandidate {
  id: string;
  type: 'mcp_tool' | 'internal' | 'query';
  server?: string;
  tool?: string;
  args?: Record<string, unknown>;
  description: string;
  expectedUtility: number;      // Predicted benefit
  expectedCost: number;         // Predicted cost (time, resources)
  uncertaintyReduction: number; // How much free energy it reduces
  source: 'goal' | 'perception' | 'inference';
}

export interface ActionResult {
  action: ActionCandidate;
  success: boolean;
  result?: unknown;
  error?: Error;
  duration: number;
  perception?: Perception;  // Created from result
}

export interface ConsciousAgentConfig {
  /** Agent name */
  name: string;
  /** Update interval for consciousness cycle (ms) */
  cycleIntervalMs: number;
  /** Enable auto-perception from MCP calls */
  autoPerceive: boolean;
  /** Enable φ-based action modulation */
  phiModulation: boolean;
  /** Minimum φ to take actions */
  minPhiForAction: number;
  /** Maximum actions per cycle */
  maxActionsPerCycle: number;
  /** Enable verbose logging */
  verbose: boolean;
}

export const DEFAULT_CONSCIOUS_AGENT_CONFIG: ConsciousAgentConfig = {
  name: 'genesis-agent',
  cycleIntervalMs: 1000,
  autoPerceive: true,
  phiModulation: true,
  minPhiForAction: 0.2,
  maxActionsPerCycle: 3,
  verbose: false,
};

// ============================================================================
// Conscious Agent
// ============================================================================

export type AgentEventType =
  | 'cycle:start'
  | 'cycle:end'
  | 'perception:received'
  | 'action:selected'
  | 'action:executed'
  | 'phi:changed'
  | 'state:changed'
  | 'goal:set';

export type AgentEventHandler = (event: {
  type: AgentEventType;
  data?: unknown;
}) => void;

/**
 * Conscious Agent - Orchestrates perception, cognition, and action
 */
export class ConsciousAgent extends EventEmitter {
  private config: ConsciousAgentConfig;

  // Core systems
  readonly mcpManager: MCPClientManager;
  readonly consciousness: ConsciousnessSystem;
  readonly perceptions: PerceptionStream;
  readonly workspace: CognitiveWorkspace;

  // State
  private currentGoal: string = '';
  private actionQueue: ActionCandidate[] = [];
  private actionHistory: ActionResult[] = [];
  private cycleCount: number = 0;

  // Cycle timer
  private cycleTimer?: ReturnType<typeof setInterval>;
  private running: boolean = false;

  constructor(
    mcpManager: MCPClientManager,
    config: Partial<ConsciousAgentConfig> = {}
  ) {
    super();
    this.config = { ...DEFAULT_CONSCIOUS_AGENT_CONFIG, ...config };
    this.mcpManager = mcpManager;

    // Initialize systems
    this.consciousness = createConsciousnessSystem({});

    this.perceptions = createPerceptionStream(mcpManager);
    this.workspace = createCognitiveWorkspace();

    // Wire systems together
    this.wireSystemsTogether();
  }

  // ============================================================================
  // Initialization
  // ============================================================================

  /**
   * Wire all systems together for integrated operation
   */
  private wireSystemsTogether(): void {
    // Connect perception stream to global workspace
    this.perceptions.connectWorkspace(this.consciousness.workspace);

    // Set system state provider for φ calculation
    this.consciousness.setSystemStateProvider(() => this.getSystemState());

    // Forward consciousness events
    this.consciousness.on((event) => {
      if (event.type === 'phi_updated') {
        this.emit('phi:changed', { level: this.consciousness.getCurrentLevel() });
      }
      if (event.type === 'state_changed') {
        this.emit('state:changed', { state: this.consciousness.getState() });
      }
    });

    // Hook into MCP tool calls for auto-perception
    if (this.config.autoPerceive) {
      this.mcpManager.on('tool:result', (server: string, tool: string, result: unknown) => {
        const perception = this.perceptions.addFromMCP(server, tool, result);
        if (perception) {
          this.emit('perception:received', { perception });
        }
      });
    }
  }

  /**
   * Get current system state for φ calculation
   */
  private getSystemState(): SystemState {
    const perceptionStats = this.perceptions.stats();
    const connectedServers = this.mcpManager.getConnectedServers();
    const now = new Date();

    // Build components from active elements
    const components: ComponentState[] = [];

    // Add perception sources as components
    for (const [source, count] of Object.entries(perceptionStats.bySource)) {
      components.push({
        id: `perception:${source}`,
        type: 'perception',
        active: count > 0,
        state: { count, source },
        entropy: Math.min(1, count / 10),
        lastUpdate: now,
      });
    }

    // Add workspace items as components
    for (const item of this.workspace.getActive()) {
      components.push({
        id: `memory:${item.id}`,
        type: item.memory.type,
        active: item.activation > 0.3,
        state: { activation: item.activation, relevance: item.relevance },
        entropy: item.activation,
        lastUpdate: item.lastAccessed,
      });
    }

    // Add connected MCPs as components
    for (const server of connectedServers) {
      components.push({
        id: `mcp:${server}`,
        type: 'mcp',
        active: true,
        state: { connected: true },
        entropy: 0.5,
        lastUpdate: now,
      });
    }

    // Create connections between components
    const connections: Connection[] = [];
    for (let i = 0; i < components.length; i++) {
      for (let j = i + 1; j < components.length; j++) {
        const strength = this.calculateConnectionStrength(
          components[i].id,
          components[j].id
        );
        if (strength > 0.1) {
          connections.push({
            from: components[i].id,
            to: components[j].id,
            strength,
            informationFlow: strength * 0.5,
            bidirectional: true,
          });
        }
      }
    }

    // Generate state hash
    const stateHash = createHash('sha256')
      .update(JSON.stringify({ components: components.map(c => c.id), timestamp: now }))
      .digest('hex')
      .slice(0, 16);

    return {
      components,
      connections,
      stateHash,
      timestamp: now,
    };
  }

  /**
   * Calculate connection strength between two elements
   */
  private calculateConnectionStrength(elem1: string, elem2: string): number {
    const type1 = elem1.split(':')[0];
    const type2 = elem2.split(':')[0];

    // Same type = stronger connection
    if (type1 === type2) return 0.8;

    // Cross-type connections
    const crossStrengths: Record<string, number> = {
      'perception:memory': 0.7,
      'memory:perception': 0.7,
      'perception:mcp': 0.5,
      'mcp:perception': 0.5,
      'memory:mcp': 0.4,
      'mcp:memory': 0.4,
    };

    return crossStrengths[`${type1}:${type2}`] || 0.3;
  }

  // ============================================================================
  // Lifecycle
  // ============================================================================

  /**
   * Start the conscious agent
   */
  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;

    // Initialize MCP manager
    await this.mcpManager.initialize();

    // Start subsystems
    this.consciousness.start();
    this.perceptions.start();

    // Start consciousness cycle
    this.cycleTimer = setInterval(
      () => this.runCycle(),
      this.config.cycleIntervalMs
    );

    this.log('Conscious agent started');
  }

  /**
   * Stop the conscious agent
   */
  async stop(): Promise<void> {
    if (!this.running) return;
    this.running = false;

    // Stop cycle timer
    if (this.cycleTimer) {
      clearInterval(this.cycleTimer);
      this.cycleTimer = undefined;
    }

    // Stop subsystems
    this.consciousness.stop();
    this.perceptions.stop();
    this.workspace.shutdown();

    // Disconnect MCPs
    await this.mcpManager.disconnectAll();

    this.log('Conscious agent stopped');
  }

  isRunning(): boolean {
    return this.running;
  }

  // ============================================================================
  // Main Consciousness Cycle
  // ============================================================================

  /**
   * Run one consciousness cycle
   */
  async runCycle(): Promise<void> {
    this.cycleCount++;
    this.emit('cycle:start', { cycle: this.cycleCount });

    try {
      // 1. Check φ level
      const phiLevel = this.consciousness.getCurrentLevel();
      const state = this.consciousness.getState();

      // 2. Skip action if φ too low (φ modulation)
      if (this.config.phiModulation && phiLevel.phi < this.config.minPhiForAction) {
        this.log(`φ too low (${phiLevel.phi.toFixed(3)}), skipping actions`);
        return;
      }

      // 3. Generate action candidates from current context
      const candidates = this.generateActionCandidates();

      // 4. Select best actions using Active Inference
      const selected = this.selectActions(candidates, state);

      // 5. Execute selected actions
      for (const action of selected.slice(0, this.config.maxActionsPerCycle)) {
        await this.executeAction(action);
      }

    } catch (error) {
      this.log(`Cycle error: ${error}`);
    }

    this.emit('cycle:end', { cycle: this.cycleCount });
  }

  // ============================================================================
  // Action Generation
  // ============================================================================

  /**
   * Generate action candidates based on current context
   */
  private generateActionCandidates(): ActionCandidate[] {
    const candidates: ActionCandidate[] = [];

    // Add queued actions
    candidates.push(...this.actionQueue);

    // Generate from current goal
    if (this.currentGoal) {
      candidates.push(...this.generateGoalActions(this.currentGoal));
    }

    // Generate from salient perceptions
    const salientPerception = this.perceptions.getMostSalient();
    if (salientPerception && salientPerception.salience > 0.7) {
      candidates.push(...this.generatePerceptionActions(salientPerception));
    }

    // Generate inference-based actions (explore uncertainty)
    candidates.push(...this.generateInferenceActions());

    return candidates;
  }

  /**
   * Generate actions to achieve a goal
   */
  private generateGoalActions(goal: string): ActionCandidate[] {
    const candidates: ActionCandidate[] = [];
    const goalLower = goal.toLowerCase();

    // Search-related goals
    if (goalLower.includes('search') || goalLower.includes('find') || goalLower.includes('look')) {
      candidates.push({
        id: `goal-search-${Date.now()}`,
        type: 'mcp_tool',
        server: 'brave-search',
        tool: 'brave_web_search',
        args: { query: goal },
        description: `Search web for: ${goal}`,
        expectedUtility: 0.7,
        expectedCost: 0.2,
        uncertaintyReduction: 0.6,
        source: 'goal',
      });
    }

    // Research/academic goals
    if (goalLower.includes('paper') || goalLower.includes('research') || goalLower.includes('academic')) {
      candidates.push({
        id: `goal-arxiv-${Date.now()}`,
        type: 'mcp_tool',
        server: 'arxiv',
        tool: 'search_arxiv',
        args: { query: goal },
        description: `Search ArXiv for: ${goal}`,
        expectedUtility: 0.8,
        expectedCost: 0.3,
        uncertaintyReduction: 0.7,
        source: 'goal',
      });
    }

    // Memory-related goals
    if (goalLower.includes('remember') || goalLower.includes('recall') || goalLower.includes('know')) {
      candidates.push({
        id: `goal-memory-${Date.now()}`,
        type: 'mcp_tool',
        server: 'memory',
        tool: 'search_nodes',
        args: { query: goal },
        description: `Search memory for: ${goal}`,
        expectedUtility: 0.6,
        expectedCost: 0.1,
        uncertaintyReduction: 0.5,
        source: 'goal',
      });
    }

    return candidates;
  }

  /**
   * Generate actions based on a perception
   */
  private generatePerceptionActions(perception: Perception): ActionCandidate[] {
    const candidates: ActionCandidate[] = [];

    // Store important perceptions in memory
    if (perception.salience > 0.8) {
      candidates.push({
        id: `perception-store-${Date.now()}`,
        type: 'mcp_tool',
        server: 'memory',
        tool: 'create_entities',
        args: {
          entities: [{
            name: `perception-${perception.id}`,
            entityType: perception.category,
            observations: [JSON.stringify(perception.data).slice(0, 500)],
          }],
        },
        description: 'Store salient perception in memory',
        expectedUtility: 0.5,
        expectedCost: 0.1,
        uncertaintyReduction: 0.3,
        source: 'perception',
      });
    }

    return candidates;
  }

  /**
   * Generate actions to reduce uncertainty (Active Inference)
   */
  private generateInferenceActions(): ActionCandidate[] {
    const candidates: ActionCandidate[] = [];

    // Check memory for gaps
    const workspaceMetrics = this.workspace.getMetrics();
    if (workspaceMetrics.cacheHits / (workspaceMetrics.totalRecalls || 1) < 0.5) {
      // Low cache hit rate - might need to build more knowledge
      candidates.push({
        id: `inference-explore-${Date.now()}`,
        type: 'mcp_tool',
        server: 'memory',
        tool: 'read_graph',
        args: {},
        description: 'Explore knowledge graph to reduce uncertainty',
        expectedUtility: 0.4,
        expectedCost: 0.1,
        uncertaintyReduction: 0.4,
        source: 'inference',
      });
    }

    return candidates;
  }

  // ============================================================================
  // Action Selection (Active Inference)
  // ============================================================================

  /**
   * Select best actions using Active Inference principles
   *
   * Minimizes Expected Free Energy:
   * G = Risk + Ambiguity
   *   = D_KL[Q(o|π) || P(o)] + E_Q[-log P(o|s)]
   *
   * In practice: prefer actions that:
   * 1. Reduce uncertainty (high uncertaintyReduction)
   * 2. Achieve goals (high expectedUtility)
   * 3. Have low cost (low expectedCost)
   */
  private selectActions(
    candidates: ActionCandidate[],
    state: ConsciousnessState
  ): ActionCandidate[] {
    if (candidates.length === 0) return [];

    // Calculate Expected Free Energy for each action
    const scored = candidates.map(action => ({
      action,
      efg: this.calculateEFE(action, state),
    }));

    // Sort by EFE (lower is better)
    scored.sort((a, b) => a.efg - b.efg);

    // Return top actions
    return scored.map(s => s.action);
  }

  /**
   * Calculate Expected Free Energy for an action
   */
  private calculateEFE(action: ActionCandidate, state: ConsciousnessState): number {
    // EFE = -utility + cost - uncertaintyReduction + stateModifier
    let efe = 0;

    // Utility term (negative because we minimize EFE)
    efe -= action.expectedUtility;

    // Cost term
    efe += action.expectedCost;

    // Epistemic value (uncertainty reduction)
    efe -= action.uncertaintyReduction * 0.5;

    // State modulation
    const stateModifiers: Record<ConsciousnessState, number> = {
      'alert': -0.1,     // More willing to act
      'aware': 0,        // Neutral
      'drowsy': 0.2,     // Less willing
      'dormant': 0.5,    // Much less willing
      'fragmented': 1.0, // Avoid action
    };
    efe += stateModifiers[state] || 0;

    return efe;
  }

  // ============================================================================
  // Action Execution
  // ============================================================================

  /**
   * Execute an action
   */
  async executeAction(action: ActionCandidate): Promise<ActionResult> {
    this.emit('action:selected', { action });
    const startTime = Date.now();

    const result: ActionResult = {
      action,
      success: false,
      duration: 0,
    };

    try {
      if (action.type === 'mcp_tool' && action.server && action.tool) {
        // Execute MCP tool call
        const mcpResult = await this.mcpManager.callTool(
          action.server,
          action.tool,
          action.args || {}
        );

        result.success = true;
        result.result = mcpResult;

        // Create perception from result (if auto-perceive is off)
        if (!this.config.autoPerceive) {
          result.perception = this.perceptions.addFromMCP(
            action.server,
            action.tool,
            mcpResult
          ) || undefined;
        }
      } else if (action.type === 'internal') {
        // Internal action (workspace manipulation, etc.)
        result.success = true;
      }
    } catch (error) {
      result.success = false;
      result.error = error as Error;
    }

    result.duration = Date.now() - startTime;

    // Record in history
    this.actionHistory.push(result);
    if (this.actionHistory.length > 100) {
      this.actionHistory.shift();
    }

    // Remove from queue if it was queued
    const queueIndex = this.actionQueue.findIndex(a => a.id === action.id);
    if (queueIndex >= 0) {
      this.actionQueue.splice(queueIndex, 1);
    }

    this.emit('action:executed', { result });
    return result;
  }

  // ============================================================================
  // Goal Management
  // ============================================================================

  /**
   * Set the current goal
   */
  setGoal(goal: string): void {
    this.currentGoal = goal;
    this.perceptions.setGoal(goal);
    this.consciousness.workspace.setGoal(goal);
    this.emit('goal:set', { goal });
  }

  /**
   * Get current goal
   */
  getGoal(): string {
    return this.currentGoal;
  }

  /**
   * Queue an action for execution
   */
  queueAction(action: Omit<ActionCandidate, 'id'>): string {
    const id = `queued-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    this.actionQueue.push({ ...action, id });
    return id;
  }

  // ============================================================================
  // Direct MCP Access
  // ============================================================================

  /**
   * Call an MCP tool directly (bypasses action selection)
   */
  async callTool<T = unknown>(
    server: string,
    tool: string,
    args: Record<string, unknown>
  ): Promise<T> {
    return this.mcpManager.callTool<T>(server, tool, args);
  }

  /**
   * Get available MCP tools
   */
  getAvailableTools(): MCPTool[] {
    return this.mcpManager.getAllTools();
  }

  // ============================================================================
  // Status & Stats
  // ============================================================================

  /**
   * Get consciousness snapshot
   */
  getConsciousnessSnapshot(): ConsciousnessSnapshot {
    return this.consciousness.takeSnapshot();
  }

  /**
   * Get agent statistics
   */
  stats(): {
    name: string;
    running: boolean;
    cycles: number;
    phi: number;
    state: ConsciousnessState;
    perceptions: number;
    workingMemory: number;
    queuedActions: number;
    executedActions: number;
    successRate: number;
    connectedMCPs: string[];
  } {
    const successCount = this.actionHistory.filter(r => r.success).length;

    return {
      name: this.config.name,
      running: this.running,
      cycles: this.cycleCount,
      phi: this.consciousness.getCurrentLevel().phi,
      state: this.consciousness.getState(),
      perceptions: this.perceptions.stats().bufferSize,
      workingMemory: this.workspace.size(),
      queuedActions: this.actionQueue.length,
      executedActions: this.actionHistory.length,
      successRate: this.actionHistory.length > 0
        ? successCount / this.actionHistory.length
        : 1,
      connectedMCPs: this.mcpManager.getConnectedServers(),
    };
  }

  // ============================================================================
  // Utilities
  // ============================================================================

  private log(message: string): void {
    if (this.config.verbose) {
      console.log(`[${this.config.name}] ${message}`);
    }
  }
}

// ============================================================================
// Factory
// ============================================================================

export function createConsciousAgent(
  mcpManager: MCPClientManager,
  config?: Partial<ConsciousAgentConfig>
): ConsciousAgent {
  return new ConsciousAgent(mcpManager, config);
}

// ============================================================================
// Singleton
// ============================================================================

let agentInstance: ConsciousAgent | null = null;

export function getConsciousAgent(
  mcpManager: MCPClientManager,
  config?: Partial<ConsciousAgentConfig>
): ConsciousAgent {
  if (!agentInstance) {
    agentInstance = createConsciousAgent(mcpManager, config);
  }
  return agentInstance;
}

export async function initializeConsciousAgent(
  mcpManager: MCPClientManager,
  config?: Partial<ConsciousAgentConfig>
): Promise<ConsciousAgent> {
  const agent = getConsciousAgent(mcpManager, config);
  await agent.start();
  return agent;
}

export function resetConsciousAgent(): void {
  if (agentInstance) {
    // v9.1.0: Log errors instead of silently ignoring
    agentInstance.stop().catch(err => console.error('[ConsciousAgent] Stop failed:', err));
    agentInstance = null;
  }
}
