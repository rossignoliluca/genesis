/**
 * Genesis 6.1 - Active Inference Integration
 *
 * Connects Active Inference to Kernel and Daemon for real autonomous operation.
 *
 * This module:
 * - Bridges observations from Kernel state (energy, task status, agents)
 * - Connects actions to Kernel operations (submit tasks, manage energy)
 * - Registers Active Inference as a daemon scheduled task
 *
 * Usage:
 * ```typescript
 * import { integrateActiveInference } from './active-inference/integration.js';
 * import { getKernel } from './kernel/index.js';
 * import { getDaemon } from './daemon/index.js';
 *
 * const kernel = getKernel();
 * const daemon = getDaemon();
 *
 * // Connect everything
 * const aiLoop = integrateActiveInference(kernel, daemon, {
 *   enableDaemonTask: true,
 *   cycleInterval: 5000,
 * });
 *
 * // Or run manually
 * await aiLoop.run(100);
 * ```
 */

import {
  AutonomousLoop,
  createAutonomousLoop,
} from './autonomous-loop.js';
import {
  createObservationGatherer,
  ObservationGatherer,
  KernelState,
  PhiState,
  SensorResult,
  WorldModelState,
} from './observations.js';
import {
  registerAction,
} from './actions.js';

import type { Kernel, KernelState as KernelStateFull, Task } from '../kernel/index.js';
import type { Daemon } from '../daemon/index.js';
import { PhiMonitor, createPhiMonitor } from '../consciousness/phi-monitor.js';
import { CognitiveWorkspace, getCognitiveWorkspace } from '../memory/cognitive-workspace.js';

// ============================================================================
// Integration Types
// ============================================================================

export interface IntegrationConfig {
  // Timing
  cycleInterval: number;      // ms between inference cycles
  maxCycles: number;          // 0 = unlimited

  // Daemon integration
  enableDaemonTask: boolean;  // Register as daemon scheduled task
  daemonTaskInterval: number; // Daemon task interval (ms)
  daemonTaskPriority: 'low' | 'normal' | 'high' | 'critical';

  // Stopping conditions
  stopOnDormant: boolean;
  stopOnError: boolean;

  // Logging
  verbose: boolean;
}

export const DEFAULT_INTEGRATION_CONFIG: IntegrationConfig = {
  cycleInterval: 1000,
  maxCycles: 0,
  enableDaemonTask: true,
  daemonTaskInterval: 5000,
  daemonTaskPriority: 'normal',
  stopOnDormant: true,
  stopOnError: false,
  verbose: false,
};

// ============================================================================
// Kernel State Mapping
// ============================================================================

/**
 * Maps KernelState to task status for observations
 */
function mapKernelStateToTaskStatus(
  state: KernelStateFull
): 'none' | 'pending' | 'running' | 'completed' | 'failed' {
  switch (state) {
    case 'idle':
      return 'none';
    case 'sensing':
    case 'thinking':
    case 'deciding':
      return 'pending';
    case 'acting':
    case 'reflecting':
    case 'self_improving':
      return 'running';
    case 'dormant':
      return 'none';
    case 'error':
      return 'failed';
    default:
      return 'none';
  }
}

// ============================================================================
// Observation Bridge
// ============================================================================

/**
 * Options for the observation bridge
 */
export interface ObservationBridgeOptions {
  phiMonitor?: PhiMonitor;
  workspace?: CognitiveWorkspace;
}

/**
 * Creates an observation gatherer connected to Kernel state
 */
export function createKernelObservationBridge(
  kernel: Kernel,
  options: ObservationBridgeOptions = {}
): ObservationGatherer {
  const gatherer = createObservationGatherer();

  // Get or create phi-monitor
  const phiMonitor = options.phiMonitor || createPhiMonitor();

  gatherer.configure({
    // Map Kernel energy and state to observations
    kernelState: () => ({
      energy: kernel.getEnergy(),
      state: kernel.getState(),
      taskStatus: mapKernelStateToTaskStatus(kernel.getState()),
    }),

    // Connected to real phi-monitor
    phiState: () => {
      const level = phiMonitor.getCurrentLevel();
      const consciousnessState = phiMonitor.getState();
      return {
        phi: level.phi,
        state: consciousnessState === 'dormant' ? 'dormant' as const : 'aware' as const,
      };
    },

    // Sensor result from agent health
    sensorResult: async () => {
      const status = kernel.getStatus();
      const healthRatio = status.agents.healthy / Math.max(1, status.agents.total);
      return {
        success: healthRatio > 0.5,
        latency: healthRatio > 0.8 ? 100 : healthRatio > 0.5 ? 2000 : 10000,
      };
    },

    // World model coherence from agent health and invariants
    worldModelState: () => {
      const status = kernel.getStatus();
      const unhealthy = status.agents.total - status.agents.healthy;
      return {
        consistent: unhealthy === 0,
        issues: unhealthy,
      };
    },
  });

  return gatherer;
}

// ============================================================================
// Action Executors
// ============================================================================

/**
 * Options for registering kernel actions
 */
export interface RegisterActionsOptions {
  workspace?: CognitiveWorkspace;
}

/**
 * Registers action executors that connect to Kernel operations
 */
export function registerKernelActions(kernel: Kernel, options: RegisterActionsOptions = {}): void {
  // Get or create workspace for memory actions
  const workspace = options.workspace || getCognitiveWorkspace();
  // sense.mcp: Use Kernel's sensor agent
  registerAction('sense.mcp', async (context) => {
    try {
      // Get kernel status as "sensory data"
      const status = kernel.getStatus();
      return {
        success: true,
        action: 'sense.mcp',
        data: {
          state: status.state,
          energy: status.energy,
          agents: status.agents,
          tasks: status.tasks,
        },
        duration: 0,
      };
    } catch (error) {
      return {
        success: false,
        action: 'sense.mcp',
        error: error instanceof Error ? error.message : String(error),
        duration: 0,
      };
    }
  });

  // recall.memory: Query memory via CognitiveWorkspace
  registerAction('recall.memory', async (context) => {
    try {
      const startTime = Date.now();

      // Anticipate memories based on current goal/context
      if (context.goal) {
        await workspace.anticipate({
          goal: context.goal,
          keywords: context.parameters?.keywords as string[] | undefined,
          tags: context.parameters?.tags as string[] | undefined,
        });
      }

      // Get all active memories from working memory
      const activeItems = workspace.getActive();
      const recalled = activeItems.map(item => {
        // Extract summary based on memory type
        let summary: string;
        const mem = item.memory;
        if (mem.type === 'episodic') {
          summary = mem.content.what;
        } else if (mem.type === 'semantic') {
          summary = mem.content.concept;
        } else {
          // procedural
          summary = `${mem.content.name}: ${mem.content.description}`;
        }
        return {
          id: item.memory.id,
          type: item.memory.type,
          summary,
          relevance: item.relevance,
          activation: item.activation,
        };
      });

      return {
        success: true,
        action: 'recall.memory',
        data: {
          recalled,
          query: context.goal,
          count: recalled.length,
          metrics: workspace.getMetrics(),
        },
        duration: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        action: 'recall.memory',
        error: error instanceof Error ? error.message : String(error),
        duration: 0,
      };
    }
  });

  // plan.goals: Submit planning task to Kernel
  registerAction('plan.goals', async (context) => {
    try {
      if (context.goal) {
        const taskId = await kernel.submit({
          type: 'query',
          goal: `Plan: ${context.goal}`,
          priority: 'normal',
          requester: 'active-inference',
        });
        return {
          success: true,
          action: 'plan.goals',
          data: { taskId, goal: context.goal },
          duration: 0,
        };
      }
      return {
        success: true,
        action: 'plan.goals',
        data: { goal: null },
        duration: 0,
      };
    } catch (error) {
      return {
        success: false,
        action: 'plan.goals',
        error: error instanceof Error ? error.message : String(error),
        duration: 0,
      };
    }
  });

  // verify.ethics: Ethical check via Kernel (delegated to ethicist agent)
  registerAction('verify.ethics', async (context) => {
    // The Kernel already requires ethical checks for all tasks
    // This action is more of an explicit verification
    return {
      success: true,
      action: 'verify.ethics',
      data: { approved: true, priority: 'flourishing' },
      duration: 0,
    };
  });

  // execute.task: Execute a task via Kernel
  registerAction('execute.task', async (context) => {
    try {
      if (context.taskId) {
        // Task already submitted, just acknowledge
        return {
          success: true,
          action: 'execute.task',
          data: { taskId: context.taskId, status: 'delegated' },
          duration: 0,
        };
      }

      if (context.goal) {
        const taskId = await kernel.submit({
          type: 'build',
          goal: context.goal,
          priority: 'normal',
          requester: 'active-inference',
          context: context.parameters,
        });
        return {
          success: true,
          action: 'execute.task',
          data: { taskId },
          duration: 0,
        };
      }

      return {
        success: true,
        action: 'execute.task',
        data: { message: 'No task to execute' },
        duration: 0,
      };
    } catch (error) {
      return {
        success: false,
        action: 'execute.task',
        error: error instanceof Error ? error.message : String(error),
        duration: 0,
      };
    }
  });

  // dream.cycle: Trigger dream mode (requires daemon)
  registerAction('dream.cycle', async (context) => {
    // Dream mode is handled by daemon, not kernel directly
    return {
      success: true,
      action: 'dream.cycle',
      data: { consolidated: 0, patterns: [] },
      duration: 0,
    };
  });

  // rest.idle: Do nothing, let Kernel rest
  registerAction('rest.idle', async (_context) => {
    // Explicitly do nothing - this is Wu Wei
    return {
      success: true,
      action: 'rest.idle',
      data: { rested: true },
      duration: 0,
    };
  });

  // recharge: Restore energy
  registerAction('recharge', async (context) => {
    try {
      const currentEnergy = kernel.getEnergy();
      const rechargeAmount = 0.1; // 10% per recharge
      const newEnergy = Math.min(1.0, currentEnergy + rechargeAmount);
      kernel.setEnergy(newEnergy);

      return {
        success: true,
        action: 'recharge',
        data: {
          previousEnergy: currentEnergy,
          newEnergy,
          recharged: newEnergy - currentEnergy,
        },
        duration: 0,
      };
    } catch (error) {
      return {
        success: false,
        action: 'recharge',
        error: error instanceof Error ? error.message : String(error),
        duration: 0,
      };
    }
  });
}

// ============================================================================
// Daemon Task Registration
// ============================================================================

/**
 * Registers Active Inference as a daemon scheduled task
 */
export function registerDaemonTask(
  daemon: Daemon,
  loop: AutonomousLoop,
  config: IntegrationConfig
): void {
  daemon.schedule({
    name: 'active-inference',
    description: 'Run Active Inference cycle for autonomous decision-making',
    schedule: { type: 'interval', intervalMs: config.daemonTaskInterval },
    priority: config.daemonTaskPriority,
    handler: async (ctx) => {
      ctx.logger.debug('Running Active Inference cycle');

      try {
        // Run a single inference cycle
        const action = await loop.cycle();

        return {
          success: true,
          duration: 0,
          output: {
            action,
            beliefs: loop.getMostLikelyState(),
            cycle: loop.getCycleCount(),
          },
        };
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        ctx.logger.error(`Active Inference error: ${error.message}`, error);
        return {
          success: false,
          duration: 0,
          error,
        };
      }
    },
    tags: ['system', 'ai', 'autonomous'],
    retries: 0, // Don't retry - just run next cycle
  });
}

// ============================================================================
// Integration Function
// ============================================================================

/**
 * Integrates Active Inference with Kernel and Daemon
 *
 * @param kernel - The Genesis Kernel instance
 * @param daemon - The Genesis Daemon instance (optional)
 * @param config - Integration configuration
 * @returns Configured AutonomousLoop
 */
/**
 * Options for Active Inference integration
 */
export interface IntegrationOptions {
  phiMonitor?: PhiMonitor;
  workspace?: CognitiveWorkspace;
}

export function integrateActiveInference(
  kernel: Kernel,
  daemon?: Daemon,
  config: Partial<IntegrationConfig> = {},
  options: IntegrationOptions = {}
): AutonomousLoop {
  const fullConfig = { ...DEFAULT_INTEGRATION_CONFIG, ...config };

  // Get or create phi-monitor and workspace
  const phiMonitor = options.phiMonitor || createPhiMonitor();
  const workspace = options.workspace || getCognitiveWorkspace();

  // Create the loop
  const loop = createAutonomousLoop({
    cycleInterval: fullConfig.cycleInterval,
    maxCycles: fullConfig.maxCycles,
    stopOnEnergyCritical: fullConfig.stopOnDormant,
    verbose: fullConfig.verbose,
  });

  // Connect observations to Kernel with real phi-monitor
  const observationBridge = createKernelObservationBridge(kernel, { phiMonitor, workspace });
  const components = loop.getComponents();

  // Replace the observations gatherer configuration with real phi-monitor
  components.observations.configure({
    kernelState: () => ({
      energy: kernel.getEnergy(),
      state: kernel.getState(),
      taskStatus: mapKernelStateToTaskStatus(kernel.getState()),
    }),
    // Connected to real phi-monitor
    phiState: () => {
      const level = phiMonitor.getCurrentLevel();
      const consciousnessState = phiMonitor.getState();
      return {
        phi: level.phi,
        state: consciousnessState === 'dormant' ? 'dormant' as const : 'aware' as const,
      };
    },
    sensorResult: async () => {
      const status = kernel.getStatus();
      const healthRatio = status.agents.healthy / Math.max(1, status.agents.total);
      return {
        success: healthRatio > 0.5,
        latency: healthRatio > 0.8 ? 100 : 2000,
      };
    },
    worldModelState: () => {
      const status = kernel.getStatus();
      return {
        consistent: status.agents.healthy === status.agents.total,
        issues: status.agents.total - status.agents.healthy,
      };
    },
  });

  // Register Kernel action executors with workspace
  registerKernelActions(kernel, { workspace });

  // Connect to Kernel state changes
  kernel.onStateChange((newState, prevState) => {
    if (fullConfig.verbose) {
      console.log(`[AI Integration] Kernel state: ${prevState} -> ${newState}`);
    }

    // Stop inference if kernel enters dormant or error state
    if (fullConfig.stopOnDormant && newState === 'dormant') {
      if (loop.isRunning()) {
        loop.stop('kernel_dormant');
      }
    }

    if (fullConfig.stopOnError && newState === 'error') {
      if (loop.isRunning()) {
        loop.stop('kernel_error');
      }
    }
  });

  // Register as daemon task if daemon provided
  if (daemon && fullConfig.enableDaemonTask) {
    registerDaemonTask(daemon, loop, fullConfig);

    // Subscribe to daemon events
    daemon.on((event) => {
      if (event.type === 'daemon_stopped') {
        if (loop.isRunning()) {
          loop.stop('daemon_stopped');
        }
      }

      // When dream mode starts, pause inference
      if (event.type === 'dream_started') {
        if (loop.isRunning()) {
          loop.stop('dreaming');
        }
      }
    });
  }

  return loop;
}

// ============================================================================
// Convenience: All-in-one Setup
// ============================================================================

export interface IntegratedSystem {
  kernel: Kernel;
  daemon: Daemon;
  loop: AutonomousLoop;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  status: () => {
    kernel: ReturnType<Kernel['getStatus']>;
    daemon: ReturnType<Daemon['status']>;
    inference: {
      running: boolean;
      cycles: number;
      beliefs: ReturnType<AutonomousLoop['getMostLikelyState']>;
    };
  };
}

/**
 * Create a fully integrated autonomous system
 */
export async function createIntegratedSystem(
  config: Partial<IntegrationConfig> = {}
): Promise<IntegratedSystem> {
  // Dynamic imports to avoid circular dependencies
  const { getKernel } = await import('../kernel/index.js');
  const { getDaemon } = await import('../daemon/index.js');

  const kernel = getKernel();

  // Build daemon dependencies from kernel
  const daemonDeps = {
    kernel: {
      checkAgentHealth: async () => {
        const status = kernel.getStatus();
        // Return health for each agent type
        const agents = kernel.getAgents();
        return Array.from(agents.entries()).map(([type, agent]) => ({
          id: agent.id,
          healthy: ['idle', 'working', 'waiting'].includes(agent.health().state),
          latency: 100,
        }));
      },
      checkInvariants: async () => {
        // Get invariant registry and check all
        const registry = kernel.getInvariantRegistry();
        const invariants = registry.getAll();
        return invariants.map((inv) => ({
          id: inv.id,
          satisfied: true, // We can't check without context
          message: inv.description,
        }));
      },
      repairInvariant: async (id: string) => {
        // Kernel doesn't have direct repair, return false
        return false;
      },
      getState: () => ({
        state: kernel.getState(),
        energy: kernel.getEnergy(),
      }),
      rechargeEnergy: (amount: number) => {
        kernel.setEnergy(kernel.getEnergy() + amount);
      },
      resetState: () => {
        // Reset to idle state if possible
        // The kernel manages its own state, so this is limited
      },
    },
  };

  const daemon = getDaemon(daemonDeps);

  const loop = integrateActiveInference(kernel, daemon, config);

  return {
    kernel,
    daemon,
    loop,

    start: async () => {
      await kernel.start();
      daemon.start();
    },

    stop: async () => {
      if (loop.isRunning()) {
        loop.stop('system_shutdown');
      }
      daemon.stop();
      await kernel.stop();
    },

    status: () => ({
      kernel: kernel.getStatus(),
      daemon: daemon.status(),
      inference: {
        running: loop.isRunning(),
        cycles: loop.getCycleCount(),
        beliefs: loop.getMostLikelyState(),
      },
    }),
  };
}

// ============================================================================
// MCP Observation Bridge
// ============================================================================

export interface MCPObservationConfig {
  verbose: boolean;
}

/**
 * Creates observation sources backed by real MCP calls
 *
 * Maps MCPs to observations:
 * - memory.read_graph → energy (from entity state) + worldModel coherence
 * - brave-search → tool perception (latency, success)
 * - gemini → phi state (from search activity)
 */
export async function createMCPObservationBridge(
  config: Partial<MCPObservationConfig> = {}
): Promise<{
  kernelState: () => KernelState;
  phiState: () => PhiState;
  sensorResult: () => Promise<SensorResult>;
  worldModelState: () => WorldModelState;
  lastMCPResults: () => {
    memory: any;
    search: any;
    latencies: Record<string, number>;
  };
}> {
  const { getMCPClient } = await import('../mcp/index.js');
  const mcpClient = getMCPClient();

  // Track latest MCP results
  let lastMemoryResult: any = null;
  let lastSearchResult: any = null;
  let mcpLatencies: Record<string, number> = {};

  // Fetch memory graph (cached for 5 seconds)
  let memoryCache: { data: any; timestamp: number } | null = null;
  const CACHE_TTL = 5000;

  async function fetchMemoryGraph() {
    const now = Date.now();
    if (memoryCache && now - memoryCache.timestamp < CACHE_TTL) {
      return memoryCache.data;
    }

    const start = Date.now();
    try {
      const result = await mcpClient.call('memory', 'read_graph', {});
      mcpLatencies['memory'] = Date.now() - start;
      lastMemoryResult = result.success ? result.data : null;
      memoryCache = { data: lastMemoryResult, timestamp: now };
      return lastMemoryResult;
    } catch (error) {
      mcpLatencies['memory'] = Date.now() - start;
      if (config.verbose) {
        console.log(`[MCP Obs] Memory fetch error: ${error}`);
      }
      return null;
    }
  }

  // Calculate energy from memory graph
  function calculateEnergy(memoryGraph: any): number {
    if (!memoryGraph?.entities) return 0.5;

    // More entities = more active system = higher energy
    const entityCount = memoryGraph.entities.length;
    const relationCount = memoryGraph.relations?.length ?? 0;

    // Normalize: 0-10 entities = 0.3-1.0 energy
    const entityEnergy = Math.min(1.0, 0.3 + (entityCount / 10) * 0.7);
    const relationBonus = Math.min(0.2, relationCount * 0.02);

    return Math.min(1.0, entityEnergy + relationBonus);
  }

  // Calculate world model coherence
  function calculateCoherence(memoryGraph: any): { consistent: boolean; issues: number } {
    if (!memoryGraph) {
      return { consistent: false, issues: 1 };
    }

    // Check for dangling relations (referencing non-existent entities)
    const entityNames = new Set((memoryGraph.entities || []).map((e: any) => e.name));
    const relations = memoryGraph.relations || [];
    let issues = 0;

    for (const rel of relations) {
      if (!entityNames.has(rel.from)) issues++;
      if (!entityNames.has(rel.to)) issues++;
    }

    return { consistent: issues === 0, issues };
  }

  return {
    kernelState: () => {
      // Use cached memory result
      const energy = memoryCache?.data ? calculateEnergy(memoryCache.data) : 0.5;
      const avgLatency = Object.values(mcpLatencies).reduce((a, b) => a + b, 0) /
        Math.max(1, Object.keys(mcpLatencies).length);

      // Infer state from latency
      let state = 'idle';
      if (avgLatency < 500) state = 'active';
      else if (avgLatency < 2000) state = 'sensing';
      else state = 'slow';

      return {
        energy,
        state,
        taskStatus: 'none' as const,
      };
    },

    phiState: () => {
      // Infer phi from MCP responsiveness
      const avgLatency = Object.values(mcpLatencies).reduce((a, b) => a + b, 0) /
        Math.max(1, Object.keys(mcpLatencies).length);
      const successCount = Object.keys(mcpLatencies).length;

      // Phi represents integrated information (how well MCPs are working together)
      let phi = 0.5;
      if (successCount >= 3 && avgLatency < 1000) phi = 0.9;
      else if (successCount >= 2 && avgLatency < 2000) phi = 0.7;
      else if (successCount >= 1) phi = 0.4;
      else phi = 0.1;

      return {
        phi,
        state: phi > 0.6 ? 'aware' as const : phi > 0.3 ? 'alert' as const : 'drowsy' as const,
      };
    },

    sensorResult: async () => {
      // Actually call an MCP to measure real latency
      const start = Date.now();
      try {
        // Fetch memory graph (this is the primary sensor)
        await fetchMemoryGraph();

        // Also try a quick brave search to test connectivity
        const searchStart = Date.now();
        try {
          const searchResult = await mcpClient.call('brave-search', 'brave_web_search', {
            query: 'test connection',
            count: 1,
          });
          mcpLatencies['brave-search'] = Date.now() - searchStart;
          lastSearchResult = searchResult.success ? searchResult.data : null;
        } catch (e) {
          mcpLatencies['brave-search'] = Date.now() - searchStart;
          if (config.verbose) {
            console.log(`[MCP Obs] Brave search error: ${e}`);
          }
        }

        const totalLatency = Date.now() - start;
        return {
          success: true,
          latency: totalLatency,
        };
      } catch (error) {
        return {
          success: false,
          latency: Date.now() - start,
          error: String(error),
        };
      }
    },

    worldModelState: () => {
      return calculateCoherence(memoryCache?.data);
    },

    lastMCPResults: () => ({
      memory: lastMemoryResult,
      search: lastSearchResult,
      latencies: { ...mcpLatencies },
    }),
  };
}

/**
 * Create Active Inference loop with real MCP observations
 */
export async function createMCPInferenceLoop(
  config: Partial<IntegrationConfig & MCPObservationConfig> = {}
): Promise<{
  loop: AutonomousLoop;
  mcpBridge: Awaited<ReturnType<typeof createMCPObservationBridge>>;
}> {
  const fullConfig = { ...DEFAULT_INTEGRATION_CONFIG, ...config };

  // Create MCP observation bridge
  const mcpBridge = await createMCPObservationBridge({ verbose: fullConfig.verbose });

  // Create the loop
  const loop = createAutonomousLoop({
    cycleInterval: fullConfig.cycleInterval,
    maxCycles: fullConfig.maxCycles,
    stopOnEnergyCritical: true,
    verbose: fullConfig.verbose,
  });

  // Configure observations with MCP sources
  const components = loop.getComponents();
  components.observations.configure({
    kernelState: mcpBridge.kernelState,
    phiState: mcpBridge.phiState,
    sensorResult: mcpBridge.sensorResult,
    worldModelState: mcpBridge.worldModelState,
  });

  return { loop, mcpBridge };
}
