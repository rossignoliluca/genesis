/**
 * Genesis 4.0 - Agent System
 *
 * Multi-agent ecosystem with 10 specialized agents:
 *
 * COGNITION:
 * - Explorer: Searches, discovers, ranks novelty
 * - Memory: Stores with Ebbinghaus decay
 * - Planner: Decomposes goals into steps
 * - Predictor: Forecasts outcomes
 *
 * EVALUATION:
 * - Feeling: Evaluates importance/valence
 * - Critic: Finds problems, suggests improvements
 * - Ethicist: Priority stack ethics
 *
 * ACTION:
 * - Builder: Generates code/artifacts
 * - Narrator: Creates coherent narratives
 * - Sensor: Interface to MCP servers
 */

// ============================================================================
// Core Exports
// ============================================================================

export * from './types.js';
export { MessageBus, messageBus } from './message-bus.js';
export { BaseAgent, registerAgentFactory, getAgentFactory, listAgentTypes } from './base-agent.js';

// ============================================================================
// Agent Exports
// ============================================================================

export { ExplorerAgent, createExplorerAgent } from './explorer.js';
export { MemoryAgent, createMemoryAgent } from './memory.js';
export { PlannerAgent, createPlannerAgent } from './planner.js';
export { PredictorAgent, createPredictorAgent } from './predictor.js';
export { FeelingAgent, createFeelingAgent } from './feeling.js';
export { CriticAgent, createCriticAgent } from './critic.js';
export { EthicistAgent, createEthicistAgent } from './ethicist.js';
export { BuilderAgent, createBuilderAgent } from './builder.js';
export { NarratorAgent, createNarratorAgent } from './narrator.js';
export { SensorAgent, createSensorAgent } from './sensor.js';

// ============================================================================
// Phase 11: Multi-Agent Coordination (v7.6)
// ============================================================================

export {
  AgentCoordinator,
  getCoordinator,
  createCoordinator,
  resetCoordinator,
  coordinateAgents,
  routeToAgent,
  runWorkflow,
  type CoordinationPattern,
  type AggregationStrategy,
  type CoordinationTask,
  type AgentResponse,
  type WorkflowStep,
  type Workflow,
  type WorkflowContext,
  type DebateConfig,
  type VoteResult,
} from './coordinator.js';

// ============================================================================
// Import all agents to register factories
// ============================================================================

import './explorer.js';
import './memory.js';
import './planner.js';
import './predictor.js';
import './feeling.js';
import './critic.js';
import './ethicist.js';
import './builder.js';
import './narrator.js';
import './sensor.js';

// ============================================================================
// Agent Registry
// ============================================================================

import { MessageBus, messageBus } from './message-bus.js';
import { BaseAgent, getAgentFactory, listAgentTypes } from './base-agent.js';
import { AgentType, Agent } from './types.js';

/**
 * Registry for managing active agents
 */
export class AgentRegistry {
  private agents: Map<string, BaseAgent> = new Map();
  private bus: MessageBus;

  constructor(bus: MessageBus = messageBus) {
    this.bus = bus;
  }

  /**
   * Spawn an agent by type
   */
  spawn(type: AgentType): BaseAgent {
    const factory = getAgentFactory(type);
    if (!factory) {
      throw new Error(`Unknown agent type: ${type}`);
    }

    const agent = factory(this.bus);
    this.agents.set(agent.id, agent);

    return agent;
  }

  /**
   * Spawn all available agent types
   */
  spawnAll(): Map<AgentType, BaseAgent> {
    const spawned = new Map<AgentType, BaseAgent>();

    for (const type of listAgentTypes()) {
      const agent = this.spawn(type as AgentType);
      spawned.set(type as AgentType, agent);
    }

    return spawned;
  }

  /**
   * Get an agent by ID
   */
  get(id: string): BaseAgent | undefined {
    return this.agents.get(id);
  }

  /**
   * Get all agents of a specific type
   */
  getByType(type: AgentType): BaseAgent[] {
    return Array.from(this.agents.values()).filter((a) => a.agentType === type);
  }

  /**
   * Get all active agents
   */
  getAll(): BaseAgent[] {
    return Array.from(this.agents.values());
  }

  /**
   * Shutdown an agent
   */
  shutdown(id: string): void {
    const agent = this.agents.get(id);
    if (agent) {
      agent.shutdown();
      this.agents.delete(id);
    }
  }

  /**
   * Shutdown all agents
   */
  shutdownAll(): void {
    for (const agent of this.agents.values()) {
      agent.shutdown();
    }
    this.agents.clear();
  }

  /**
   * Get registry stats
   */
  getStats(): {
    totalAgents: number;
    byType: Record<string, number>;
    byState: Record<string, number>;
  } {
    const byType: Record<string, number> = {};
    const byState: Record<string, number> = {};

    for (const agent of this.agents.values()) {
      byType[agent.agentType] = (byType[agent.agentType] || 0) + 1;
      byState[agent.state] = (byState[agent.state] || 0) + 1;
    }

    return {
      totalAgents: this.agents.size,
      byType,
      byState,
    };
  }
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Create a full agent ecosystem
 */
export function createAgentEcosystem(bus: MessageBus = messageBus): {
  registry: AgentRegistry;
  agents: Map<AgentType, BaseAgent>;
} {
  const registry = new AgentRegistry(bus);
  const agents = registry.spawnAll();

  return { registry, agents };
}

/**
 * Quick spawn a single agent
 */
export function spawnAgent(type: AgentType, bus: MessageBus = messageBus): BaseAgent {
  const factory = getAgentFactory(type);
  if (!factory) {
    throw new Error(`Unknown agent type: ${type}`);
  }
  return factory(bus);
}

// ============================================================================
// Default Export
// ============================================================================

export default {
  MessageBus,
  messageBus,
  AgentRegistry,
  createAgentEcosystem,
  spawnAgent,
  listAgentTypes,
};
