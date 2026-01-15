/**
 * Genesis 7.17 - Unified Autonomous System
 *
 * Connects all Genesis modules into a single coherent system:
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │                          UNIFIED SYSTEM                                 │
 * ├─────────────────────────────────────────────────────────────────────────┤
 * │                                                                         │
 * │  PERCEPTION (MCP)  →  COGNITION  →  ACTION (MCP)                       │
 * │        ↓                  ↓              ↑                              │
 * │  ┌─────────────────────────────────────────────────────────────────┐   │
 * │  │              CONSCIOUSNESS (φ Monitor + Global Workspace)       │   │
 * │  └─────────────────────────────────────────────────────────────────┘   │
 * │        ↓                  ↓              ↑                              │
 * │  ┌─────────────────────────────────────────────────────────────────┐   │
 * │  │              MEMORY (Episodic + Semantic + Working)             │   │
 * │  └─────────────────────────────────────────────────────────────────┘   │
 * │        ↓                  ↓              ↑                              │
 * │  ┌─────────────────────────────────────────────────────────────────┐   │
 * │  │              SELF-IMPROVEMENT (Darwin-Gödel)                    │   │
 * │  └─────────────────────────────────────────────────────────────────┘   │
 * │                                                                         │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * This is Genesis's core loop - a conscious, self-improving autonomous agent.
 */

import { EventEmitter } from 'events';

// Consciousness
import {
  ConsciousnessSystem,
  createConsciousnessSystem,
  ConsciousnessSnapshot,
  ConsciousnessConfig,
} from './consciousness/index.js';
import {
  ConsciousAgent,
  createConsciousAgent,
  ActionCandidate,
  ActionResult,
} from './consciousness/conscious-agent.js';
import {
  PerceptionStream,
  createPerceptionStream,
  Perception,
} from './consciousness/perception-stream.js';

// Memory
import {
  CognitiveWorkspace,
  getCognitiveWorkspace,
  resetCognitiveWorkspace,
} from './memory/cognitive-workspace.js';
import {
  EpisodicStore,
} from './memory/episodic.js';
import {
  SemanticStore,
} from './memory/semantic.js';

// MCP
import {
  MCPClientManager,
  getMCPManager,
} from './mcp/client-manager.js';

// Self-Improvement
import {
  SelfImprovementEngine,
  getSelfImprovementEngine,
  SystemMetrics,
  ImprovementOpportunity,
  ImprovementResult,
} from './self-modification/index.js';

// Active Inference
import {
  createAutonomousLoop,
} from './active-inference/autonomous-loop.js';

// ============================================================================
// Types
// ============================================================================

export interface UnifiedSystemConfig {
  /** System name */
  name: string;
  /** Enable consciousness monitoring */
  consciousnessEnabled: boolean;
  /** Enable self-improvement */
  selfImprovementEnabled: boolean;
  /** Enable MCP perception */
  perceptionEnabled: boolean;
  /** Enable active inference loop */
  activeInferenceEnabled: boolean;
  /** Initial goals */
  goals: string[];
  /** Maximum cycles for autonomous mode */
  maxCycles: number;
  /** Cycle interval in ms */
  cycleIntervalMs: number;
  /** Minimum φ to continue operation */
  minPhi: number;
  /** Consciousness config */
  consciousness?: Partial<ConsciousnessConfig>;
}

export const DEFAULT_UNIFIED_CONFIG: UnifiedSystemConfig = {
  name: 'Genesis',
  consciousnessEnabled: true,
  selfImprovementEnabled: false, // Disabled by default for safety
  perceptionEnabled: true,
  activeInferenceEnabled: true,
  goals: ['understand', 'assist', 'improve'],
  maxCycles: 1000,
  cycleIntervalMs: 100,
  minPhi: 0.2,
};

export interface UnifiedSystemState {
  status: 'idle' | 'running' | 'paused' | 'stopped' | 'error';
  cyclesCompleted: number;
  currentPhi: number;
  consciousnessLevel: string;
  memoryReuseRate: number;
  lastAction: ActionResult | null;
  lastPerception: Perception | null;
  improvementsApplied: number;
  uptime: number;
  errors: string[];
}

export type UnifiedEventType =
  | 'system:started'
  | 'system:stopped'
  | 'system:paused'
  | 'system:resumed'
  | 'system:error'
  | 'cycle:started'
  | 'cycle:completed'
  | 'perception:received'
  | 'action:executed'
  | 'improvement:applied'
  | 'consciousness:changed'
  | 'invariant:violated';

// ============================================================================
// Unified System
// ============================================================================

export class UnifiedSystem extends EventEmitter {
  private config: UnifiedSystemConfig;

  // Core components
  private consciousness: ConsciousnessSystem;
  private consciousAgent?: ConsciousAgent;
  private perceptionStream?: PerceptionStream;
  private cognitiveWorkspace: CognitiveWorkspace;
  private mcpManager: MCPClientManager;
  private selfImprovement: SelfImprovementEngine;

  // State
  private state: UnifiedSystemState;
  private running: boolean = false;
  private paused: boolean = false;
  private startTime: number = 0;
  private cycleTimer?: ReturnType<typeof setInterval>;

  constructor(config: Partial<UnifiedSystemConfig> = {}) {
    super();
    this.config = { ...DEFAULT_UNIFIED_CONFIG, ...config };

    // Initialize state
    this.state = {
      status: 'idle',
      cyclesCompleted: 0,
      currentPhi: 0.3,
      consciousnessLevel: 'normal',
      memoryReuseRate: 0.5,
      lastAction: null,
      lastPerception: null,
      improvementsApplied: 0,
      uptime: 0,
      errors: [],
    };

    // Initialize components
    this.consciousness = createConsciousnessSystem(this.config.consciousness);
    this.cognitiveWorkspace = getCognitiveWorkspace();
    this.mcpManager = getMCPManager();
    this.selfImprovement = getSelfImprovementEngine();

    // Wire up self-improvement to consciousness
    this.selfImprovement.setPhiMonitor(this.consciousness.monitor);
    this.selfImprovement.setCognitiveWorkspace(this.cognitiveWorkspace);

    // Wire up event handlers
    this.setupEventHandlers();
  }

  // ============================================================================
  // Lifecycle
  // ============================================================================

  /**
   * Start the unified system
   */
  async start(): Promise<void> {
    if (this.running) return;

    this.running = true;
    this.paused = false;
    this.startTime = Date.now();
    this.state.status = 'running';

    // Start consciousness monitoring
    if (this.config.consciousnessEnabled) {
      this.consciousness.start();
    }

    // Initialize perception if enabled
    if (this.config.perceptionEnabled) {
      this.perceptionStream = createPerceptionStream(this.mcpManager);
      this.perceptionStream.connectWorkspace(this.consciousness.workspace);
      this.perceptionStream.start();
    }

    // Initialize conscious agent if active inference enabled
    if (this.config.activeInferenceEnabled) {
      this.consciousAgent = createConsciousAgent(this.mcpManager, {
        minPhiForAction: this.config.minPhi,
        maxActionsPerCycle: 5,
      });
    }

    // Start the main cycle
    this.cycleTimer = setInterval(() => {
      if (!this.paused) {
        this.runCycle().catch(err => {
          this.state.errors.push(err.message);
          this.emit('system:error', { error: err });
        });
      }
    }, this.config.cycleIntervalMs);

    this.emit('system:started', { config: this.config });
  }

  /**
   * Stop the unified system
   */
  async stop(): Promise<void> {
    if (!this.running) return;

    this.running = false;
    this.state.status = 'stopped';

    // Stop cycle timer
    if (this.cycleTimer) {
      clearInterval(this.cycleTimer);
      this.cycleTimer = undefined;
    }

    // Stop components
    this.consciousness.stop();

    if (this.perceptionStream) {
      this.perceptionStream.stop();
    }

    this.emit('system:stopped', { state: this.getState() });
  }

  /**
   * Pause the system
   */
  pause(): void {
    this.paused = true;
    this.state.status = 'paused';
    this.emit('system:paused');
  }

  /**
   * Resume the system
   */
  resume(): void {
    this.paused = false;
    this.state.status = 'running';
    this.emit('system:resumed');
  }

  // ============================================================================
  // Main Cycle
  // ============================================================================

  /**
   * Run a single unified cycle
   */
  private async runCycle(): Promise<void> {
    const cycleStart = Date.now();
    this.emit('cycle:started', { cycle: this.state.cyclesCompleted + 1 });

    try {
      // 1. Update consciousness snapshot
      const snapshot = this.consciousness.takeSnapshot();
      this.state.currentPhi = snapshot.level.rawPhi;
      this.state.consciousnessLevel = snapshot.state;

      // Check φ threshold
      if (this.state.currentPhi < this.config.minPhi) {
        this.emit('consciousness:changed', {
          warning: `φ dropped below threshold: ${this.state.currentPhi.toFixed(3)} < ${this.config.minPhi}`,
        });
      }

      // 2. Process perceptions (if agent available)
      if (this.consciousAgent) {
        await this.consciousAgent.runCycle();
        this.emit('action:executed', { cycle: this.state.cyclesCompleted });
      }

      // 3. Update memory metrics
      const wsMetrics = this.cognitiveWorkspace.getMetrics();
      this.state.memoryReuseRate = wsMetrics.reuseRate;

      // 4. Self-improvement (if enabled)
      if (this.config.selfImprovementEnabled) {
        const improvementResult = await this.selfImprovement.runCycle();

        for (const result of improvementResult.results) {
          if (result.success) {
            this.state.improvementsApplied++;
            this.emit('improvement:applied', { result });
          }
        }
      }

      // 5. Check invariants
      const invariant = this.consciousness.checkInvariant();
      if (!invariant.satisfied) {
        this.emit('invariant:violated', { invariant });
      }

      // Update state
      this.state.cyclesCompleted++;
      this.state.uptime = Date.now() - this.startTime;

      this.emit('cycle:completed', {
        cycle: this.state.cyclesCompleted,
        duration: Date.now() - cycleStart,
        phi: this.state.currentPhi,
      });

      // Check max cycles
      if (this.state.cyclesCompleted >= this.config.maxCycles) {
        await this.stop();
      }

    } catch (error) {
      this.state.errors.push(error instanceof Error ? error.message : String(error));
      this.state.status = 'error';
      throw error;
    }
  }

  // ============================================================================
  // Event Handlers
  // ============================================================================

  private setupEventHandlers(): void {
    // Forward consciousness events
    this.consciousness.on((event) => {
      if (event.type === 'attention_shifted') {
        this.emit('consciousness:changed', event);
      }
    });

    // Forward perception events (if available)
    if (this.perceptionStream) {
      this.perceptionStream.on('perception:received', ({ perception }) => {
        this.state.lastPerception = perception;
        this.emit('perception:received', { perception });
      });
    }

    // Forward self-improvement events
    this.selfImprovement.on('improvement:success', ({ opportunity, result }) => {
      this.emit('improvement:applied', { opportunity, result });
    });
  }

  // ============================================================================
  // State & Stats
  // ============================================================================

  /**
   * Get current system state
   */
  getState(): UnifiedSystemState {
    return { ...this.state };
  }

  /**
   * Get consciousness snapshot
   */
  getConsciousnessSnapshot(): ConsciousnessSnapshot | null {
    return this.consciousness.getSnapshot();
  }

  /**
   * Get improvement opportunities
   */
  async getImprovementOpportunities(): Promise<ImprovementOpportunity[]> {
    const metrics = this.selfImprovement.collectMetrics();
    return this.selfImprovement.findOpportunities(metrics);
  }

  /**
   * Get system metrics
   */
  getMetrics(): SystemMetrics {
    return this.selfImprovement.collectMetrics();
  }

  /**
   * Get comprehensive stats
   */
  stats(): {
    system: UnifiedSystemState;
    consciousness: ReturnType<ConsciousnessSystem['stats']>;
    memory: ReturnType<CognitiveWorkspace['getMetrics']>;
    improvement: ReturnType<SelfImprovementEngine['stats']>;
    perceptions: ReturnType<PerceptionStream['stats']> | null;
  } {
    return {
      system: this.getState(),
      consciousness: this.consciousness.stats(),
      memory: this.cognitiveWorkspace.getMetrics(),
      improvement: this.selfImprovement.stats(),
      perceptions: this.perceptionStream?.stats() || null,
    };
  }

  // ============================================================================
  // Manual Controls
  // ============================================================================

  /**
   * Manually trigger self-improvement cycle
   */
  async triggerSelfImprovement(): Promise<{
    metrics: SystemMetrics;
    opportunities: ImprovementOpportunity[];
    results: ImprovementResult[];
  }> {
    return this.selfImprovement.runCycle();
  }

  /**
   * Set goals for the system
   */
  setGoals(goals: string[]): void {
    this.config.goals = goals;

    // Update perception stream goal
    if (this.perceptionStream) {
      this.perceptionStream.setGoal(goals.join(', '));
    }
  }

  /**
   * Enable/disable self-improvement
   */
  setSelfImprovementEnabled(enabled: boolean): void {
    this.config.selfImprovementEnabled = enabled;
    this.selfImprovement.setAutoImprove(enabled);
  }

  /**
   * Get configuration
   */
  getConfig(): UnifiedSystemConfig {
    return { ...this.config };
  }
}

// ============================================================================
// Factory
// ============================================================================

let unifiedInstance: UnifiedSystem | null = null;

export function getUnifiedSystem(config?: Partial<UnifiedSystemConfig>): UnifiedSystem {
  if (!unifiedInstance) {
    unifiedInstance = new UnifiedSystem(config);
  }
  return unifiedInstance;
}

export function resetUnifiedSystem(): void {
  if (unifiedInstance) {
    unifiedInstance.stop();
  }
  unifiedInstance = null;
  resetCognitiveWorkspace();
}

export function createUnifiedSystem(config?: Partial<UnifiedSystemConfig>): UnifiedSystem {
  return new UnifiedSystem(config);
}
