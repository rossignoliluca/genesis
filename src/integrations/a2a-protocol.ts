/**
 * Genesis v32 - A2A Protocol (Item 19)
 *
 * Google's Agent-to-Agent protocol for horizontal agent communication.
 * MCP = vertical (agent→tools), A2A = horizontal (agent→agent).
 *
 * Implements:
 * - Agent Card: discovery metadata for Genesis
 * - Task management: send/receive tasks between agents
 * - Message exchange: structured communication
 */

// ============================================================================
// A2A Types (per Google's specification)
// ============================================================================

export interface AgentCard {
  name: string;
  description: string;
  url: string;
  version: string;
  capabilities: AgentCapability[];
  skills: AgentSkill[];
  authentication?: {
    type: 'bearer' | 'api_key' | 'none';
  };
}

export interface AgentCapability {
  name: string;
  description: string;
}

export interface AgentSkill {
  id: string;
  name: string;
  description: string;
  inputSchema?: Record<string, any>;
  outputSchema?: Record<string, any>;
}

export interface A2ATask {
  id: string;
  from: string;           // agent URL
  to: string;             // agent URL
  skill: string;          // skill ID
  input: Record<string, any>;
  status: 'pending' | 'running' | 'completed' | 'failed';
  output?: Record<string, any>;
  createdAt: string;
  completedAt?: string;
}

export interface A2AMessage {
  id: string;
  from: string;
  to: string;
  type: 'request' | 'response' | 'notification';
  content: Record<string, any>;
  timestamp: string;
}

// ============================================================================
// Genesis Agent Card
// ============================================================================

/**
 * Generate Genesis's Agent Card for A2A discovery
 */
export function getGenesisAgentCard(baseUrl = 'http://localhost:9877'): AgentCard {
  return {
    name: 'Genesis',
    description: 'Cognitive AI system with bio-inspired architecture, market strategy, and multi-horizon memory. Acts as a cognitive backend for AI applications.',
    url: baseUrl,
    version: '32.0.0',
    capabilities: [
      { name: 'memory', description: 'Multi-layer memory with FSRS spaced repetition (episodic, semantic, procedural)' },
      { name: 'market_strategy', description: 'Weekly market analysis with contrarian positioning, calibration, and track record' },
      { name: 'active_inference', description: 'Free energy minimization with belief updating and policy selection' },
      { name: 'reasoning', description: 'Multi-strategy composition (ToT, GoT, PRM) with metacognitive control' },
    ],
    skills: [
      {
        id: 'market_brief',
        name: 'Weekly Market Brief',
        description: 'Generate a full weekly market strategy brief with narratives, positioning, and PPTX',
        inputSchema: {
          type: 'object',
          properties: {
            sourcePriority: { type: 'number', description: 'Source priority (1-3)' },
            verify: { type: 'boolean', description: 'Run data verification' },
          },
        },
      },
      {
        id: 'memory_recall',
        name: 'Memory Recall',
        description: 'Search Genesis memory system for relevant past knowledge',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string' },
            limit: { type: 'number' },
          },
          required: ['query'],
        },
      },
      {
        id: 'cognitive_state',
        name: 'Cognitive State',
        description: 'Get current cognitive state (beliefs, phi, memory stats)',
        inputSchema: { type: 'object', properties: {} },
      },
      {
        id: 'analyze_topic',
        name: 'Deep Analysis',
        description: 'Analyze a topic using multi-strategy reasoning with metacognitive control',
        inputSchema: {
          type: 'object',
          properties: {
            topic: { type: 'string' },
            depth: { type: 'string', enum: ['quick', 'standard', 'deep'] },
          },
          required: ['topic'],
        },
      },
    ],
    authentication: { type: 'none' },
  };
}

// ============================================================================
// A2A Task Handler
// ============================================================================

export class A2ATaskHandler {
  private tasks: Map<string, A2ATask> = new Map();

  /**
   * Receive and process a task from another agent
   */
  async handleTask(task: A2ATask): Promise<A2ATask> {
    this.tasks.set(task.id, { ...task, status: 'running' });

    try {
      let output: Record<string, any>;

      switch (task.skill) {
        case 'memory_recall': {
          const { getMemorySystem } = await import('../memory/index.js');
          const memory = getMemorySystem();
          const results = memory.recall(task.input.query, { limit: task.input.limit || 10 });
          output = {
            results: results.map(m => ({ type: m.type, content: m.content, tags: m.tags })),
          };
          break;
        }

        case 'cognitive_state': {
          const { getMemorySystem } = await import('../memory/index.js');
          const memory = getMemorySystem();
          const stats = memory.getStats();
          output = {
            memory: { total: stats.total, episodic: stats.episodic.total, semantic: stats.semantic.total },
          };
          break;
        }

        case 'market_brief': {
          const { MemoryLayers } = await import('../market-strategist/memory-layers.js');
          const layers = new MemoryLayers();
          const weeks = layers.getRecentWeeks(1);
          const record = layers.getLatestTrackRecord();
          output = { latestWeek: weeks[0] || null, trackRecord: record };
          break;
        }

        default:
          output = { error: `Unknown skill: ${task.skill}` };
      }

      const completed: A2ATask = {
        ...task,
        status: 'completed',
        output,
        completedAt: new Date().toISOString(),
      };
      this.tasks.set(task.id, completed);
      return completed;
    } catch (error) {
      const failed: A2ATask = {
        ...task,
        status: 'failed',
        output: { error: error instanceof Error ? error.message : String(error) },
        completedAt: new Date().toISOString(),
      };
      this.tasks.set(task.id, failed);
      return failed;
    }
  }

  /** Get task status */
  getTask(id: string): A2ATask | undefined {
    return this.tasks.get(id);
  }

  /** List all tasks */
  listTasks(): A2ATask[] {
    return Array.from(this.tasks.values());
  }
}

// Singleton
let handlerInstance: A2ATaskHandler | null = null;
export function getA2AHandler(): A2ATaskHandler {
  if (!handlerInstance) handlerInstance = new A2ATaskHandler();
  return handlerInstance;
}
