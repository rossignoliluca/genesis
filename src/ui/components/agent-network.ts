/**
 * Genesis Observatory UI - Agent Network Component
 *
 * Visualizes the agent network graph showing connections between
 * Brain, LLM providers, MCP servers, and active tasks.
 */

import type { AgentNetworkData, AgentNode, AgentConnection } from '../types.js';
import type { SystemMetrics } from '../../observability/dashboard.js';

// ============================================================================
// Agent Network Data Provider
// ============================================================================

export class AgentNetwork {
  private data: AgentNetworkData;
  private subscribers: Set<(data: AgentNetworkData) => void> = new Set();
  private utilizationHistory: Array<{ timestamp: number; utilization: number }> = [];
  private maxHistory = 60;

  constructor(initialData?: AgentNetworkData) {
    this.data = initialData || this.getDefaultData();
  }

  /**
   * Update agent network data from metrics
   */
  update(metrics: SystemMetrics): void {
    const { total, active, queued } = metrics.agents;
    const { totalRequests, averageLatency, totalCost, providers } = metrics.llm;
    const { connectedServers, availableTools, totalCalls } = metrics.mcp;

    const utilization = total > 0 ? active / total : 0;

    // Build network graph
    const nodes = this.buildNodes(active, queued, providers, connectedServers, availableTools);
    const connections = this.buildConnections(nodes);

    this.data = {
      totalAgents: total,
      activeAgents: active,
      queuedTasks: queued,
      utilization,
      avgLatency: averageLatency,
      totalRequests,
      totalCost,
      providers,
      nodes,
      connections,
    };

    this.addToHistory(utilization);
    this.notifySubscribers();
  }

  /**
   * Get current agent network data
   */
  getData(): AgentNetworkData {
    return { ...this.data };
  }

  /**
   * Subscribe to agent network updates
   */
  subscribe(callback: (data: AgentNetworkData) => void): () => void {
    this.subscribers.add(callback);
    callback(this.data);
    return () => this.subscribers.delete(callback);
  }

  /**
   * Get network statistics
   */
  getStats(): Array<{
    label: string;
    value: string;
    color: string;
  }> {
    const { totalAgents, activeAgents, queuedTasks, utilization, avgLatency, totalRequests } = this.data;

    return [
      {
        label: 'Total Agents',
        value: totalAgents.toString(),
        color: '#00ff88',
      },
      {
        label: 'Active',
        value: activeAgents.toString(),
        color: this.getUtilizationColor(utilization),
      },
      {
        label: 'Queued',
        value: queuedTasks.toString(),
        color: queuedTasks > 10 ? '#ffaa00' : '#666666',
      },
      {
        label: 'Utilization',
        value: `${(utilization * 100).toFixed(0)}%`,
        color: this.getUtilizationColor(utilization),
      },
      {
        label: 'Avg Latency',
        value: `${avgLatency.toFixed(0)}ms`,
        color: avgLatency > 5000 ? '#ff4444' : avgLatency > 2000 ? '#ffaa00' : '#00ff88',
      },
      {
        label: 'Total Requests',
        value: totalRequests.toString(),
        color: '#00ff88',
      },
    ];
  }

  /**
   * Get node positions for force-directed graph
   */
  getNodePositions(width: number, height: number): Map<string, { x: number; y: number }> {
    const { nodes } = this.data;
    const positions = new Map<string, { x: number; y: number }>();

    // Simple circular layout
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.min(width, height) * 0.35;

    // Brain at center
    positions.set('brain', { x: centerX, y: centerY });

    // Other nodes in concentric circles by type
    const llmNodes = nodes.filter((n) => n.type === 'llm');
    const mcpNodes = nodes.filter((n) => n.type === 'mcp');
    const taskNodes = nodes.filter((n) => n.type === 'task');

    // LLM nodes in inner circle
    llmNodes.forEach((node, i) => {
      const angle = (i / llmNodes.length) * Math.PI * 2;
      positions.set(node.id, {
        x: centerX + Math.cos(angle) * radius * 0.6,
        y: centerY + Math.sin(angle) * radius * 0.6,
      });
    });

    // MCP nodes in outer circle
    mcpNodes.forEach((node, i) => {
      const angle = (i / mcpNodes.length) * Math.PI * 2 + Math.PI / mcpNodes.length;
      positions.set(node.id, {
        x: centerX + Math.cos(angle) * radius,
        y: centerY + Math.sin(angle) * radius,
      });
    });

    // Task nodes scattered
    taskNodes.forEach((node, i) => {
      const angle = (i / taskNodes.length) * Math.PI * 2;
      positions.set(node.id, {
        x: centerX + Math.cos(angle) * radius * 0.3,
        y: centerY + Math.sin(angle) * radius * 0.3,
      });
    });

    return positions;
  }

  /**
   * Get SVG paths for connections
   */
  getConnectionPaths(positions: Map<string, { x: number; y: number }>): Array<{
    id: string;
    path: string;
    color: string;
    width: number;
    animated: boolean;
  }> {
    const { connections } = this.data;

    return connections.map((conn, i) => {
      const source = positions.get(conn.source);
      const target = positions.get(conn.target);

      if (!source || !target) {
        return {
          id: `${conn.source}-${conn.target}`,
          path: '',
          color: '#666666',
          width: 1,
          animated: false,
        };
      }

      // Curved path
      const dx = target.x - source.x;
      const dy = target.y - source.y;
      const dr = Math.sqrt(dx * dx + dy * dy) * 0.5;

      const path = `M ${source.x} ${source.y} Q ${(source.x + target.x) / 2} ${
        (source.y + target.y) / 2 + dr * 0.2
      } ${target.x} ${target.y}`;

      return {
        id: `${conn.source}-${conn.target}`,
        path,
        color: this.getConnectionColor(conn.type),
        width: Math.max(1, conn.strength * 3),
        animated: conn.type === 'request',
      };
    });
  }

  /**
   * Get node visualization data
   */
  getNodeVisualization(node: AgentNode): {
    radius: number;
    color: string;
    strokeColor: string;
    strokeWidth: number;
    icon: string;
  } {
    const baseRadius = 30;
    const radiusMap = {
      agent: baseRadius * 1.5,
      llm: baseRadius,
      mcp: baseRadius * 0.8,
      task: baseRadius * 0.6,
    };

    const colorMap = {
      active: '#00ff88',
      idle: '#666666',
      error: '#ff4444',
      queued: '#ffaa00',
    };

    const iconMap = {
      agent: '🧠',
      llm: '🤖',
      mcp: '🔌',
      task: '📋',
    };

    return {
      radius: radiusMap[node.type],
      color: colorMap[node.status],
      strokeColor: node.status === 'active' ? '#ffffff' : '#444444',
      strokeWidth: node.status === 'active' ? 3 : 1,
      icon: iconMap[node.type],
    };
  }

  /**
   * Get utilization trend
   */
  getUtilizationTrend(): 'up' | 'down' | 'stable' {
    if (this.utilizationHistory.length < 2) return 'stable';

    const recent = this.utilizationHistory.slice(-10);
    const first = recent[0].utilization;
    const last = recent[recent.length - 1].utilization;

    if (last > first + 0.1) return 'up';
    if (last < first - 0.1) return 'down';
    return 'stable';
  }

  /**
   * Get provider breakdown
   */
  getProviderBreakdown(): Array<{
    provider: string;
    requests: number;
    cost: number;
    avgLatency: number;
  }> {
    const { providers, totalRequests, totalCost, avgLatency } = this.data;

    // Distribute evenly across providers (real implementation would track per-provider)
    return providers.map((provider) => ({
      provider,
      requests: Math.floor(totalRequests / providers.length),
      cost: totalCost / providers.length,
      avgLatency,
    }));
  }

  // --------------------------------------------------------------------------
  // Private Helpers
  // --------------------------------------------------------------------------

  private buildNodes(
    active: number,
    queued: number,
    providers: string[],
    mcpServers: number,
    mcpTools: number
  ): AgentNode[] {
    const nodes: AgentNode[] = [
      {
        id: 'brain',
        type: 'agent',
        status: active > 0 ? 'active' : 'idle',
        label: 'Genesis Brain',
        metadata: { active, queued },
      },
    ];

    // LLM provider nodes
    providers.forEach((provider, i) => {
      nodes.push({
        id: `llm-${provider}`,
        type: 'llm',
        status: 'active',
        label: provider,
        metadata: { provider },
      });
    });

    // MCP server nodes
    for (let i = 0; i < mcpServers; i++) {
      nodes.push({
        id: `mcp-${i}`,
        type: 'mcp',
        status: 'active',
        label: `MCP Server ${i + 1}`,
        metadata: { tools: Math.floor(mcpTools / mcpServers) },
      });
    }

    // Task nodes (queued tasks)
    for (let i = 0; i < Math.min(queued, 5); i++) {
      nodes.push({
        id: `task-${i}`,
        type: 'task',
        status: 'queued',
        label: `Task ${i + 1}`,
        metadata: {},
      });
    }

    return nodes;
  }

  private buildConnections(nodes: AgentNode[]): AgentConnection[] {
    const connections: AgentConnection[] = [];

    // Connect brain to all LLM providers
    nodes
      .filter((n) => n.type === 'llm')
      .forEach((llm) => {
        connections.push({
          source: 'brain',
          target: llm.id,
          type: 'request',
          strength: 0.8,
        });
      });

    // Connect brain to all MCP servers
    nodes
      .filter((n) => n.type === 'mcp')
      .forEach((mcp) => {
        connections.push({
          source: 'brain',
          target: mcp.id,
          type: 'request',
          strength: 0.6,
        });
      });

    // Connect tasks to brain
    nodes
      .filter((n) => n.type === 'task')
      .forEach((task) => {
        connections.push({
          source: task.id,
          target: 'brain',
          type: 'event',
          strength: 0.4,
        });
      });

    return connections;
  }

  private getUtilizationColor(utilization: number): string {
    if (utilization > 0.9) return '#ff4444'; // Overloaded
    if (utilization > 0.7) return '#ffaa00'; // High
    if (utilization > 0.3) return '#00ff88'; // Optimal
    return '#666666'; // Underutilized
  }

  private getConnectionColor(type: AgentConnection['type']): string {
    const colorMap = {
      request: '#00ff88',
      response: '#0088ff',
      event: '#ffaa00',
    };
    return colorMap[type];
  }

  private addToHistory(utilization: number): void {
    this.utilizationHistory.push({
      timestamp: Date.now(),
      utilization,
    });

    if (this.utilizationHistory.length > this.maxHistory) {
      this.utilizationHistory.shift();
    }
  }

  private notifySubscribers(): void {
    for (const callback of this.subscribers) {
      try {
        callback(this.data);
      } catch (err) {
        console.error('[AgentNetwork] Subscriber error:', err);
      }
    }
  }

  private getDefaultData(): AgentNetworkData {
    return {
      totalAgents: 0,
      activeAgents: 0,
      queuedTasks: 0,
      utilization: 0,
      avgLatency: 0,
      totalRequests: 0,
      totalCost: 0,
      providers: [],
      nodes: [
        {
          id: 'brain',
          type: 'agent',
          status: 'idle',
          label: 'Genesis Brain',
          metadata: {},
        },
      ],
      connections: [],
    };
  }
}

// ============================================================================
// Visualization Helpers
// ============================================================================

/**
 * Generate animated pulse effect for active connections
 */
export function generatePulseAnimation(connectionId: string): string {
  return `
    @keyframes pulse-${connectionId} {
      0% {
        stroke-dashoffset: 0;
      }
      100% {
        stroke-dashoffset: -20;
      }
    }
  `;
}

/**
 * Calculate force-directed layout (simple implementation)
 */
export function calculateForceLayout(
  nodes: AgentNode[],
  connections: AgentConnection[],
  width: number,
  height: number,
  iterations: number = 50
): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();

  // Initialize random positions
  nodes.forEach((node) => {
    positions.set(node.id, {
      x: Math.random() * width,
      y: Math.random() * height,
    });
  });

  // Simple force-directed layout
  const repulsionForce = 100;
  const attractionForce = 0.01;
  const centerForce = 0.001;

  for (let iter = 0; iter < iterations; iter++) {
    const forces = new Map<string, { x: number; y: number }>();

    // Initialize forces
    nodes.forEach((node) => {
      forces.set(node.id, { x: 0, y: 0 });
    });

    // Repulsion between all nodes
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const node1 = nodes[i];
        const node2 = nodes[j];
        const pos1 = positions.get(node1.id)!;
        const pos2 = positions.get(node2.id)!;

        const dx = pos2.x - pos1.x;
        const dy = pos2.y - pos1.y;
        const distance = Math.sqrt(dx * dx + dy * dy) || 1;

        const force = repulsionForce / (distance * distance);
        const fx = (dx / distance) * force;
        const fy = (dy / distance) * force;

        const force1 = forces.get(node1.id)!;
        const force2 = forces.get(node2.id)!;
        force1.x -= fx;
        force1.y -= fy;
        force2.x += fx;
        force2.y += fy;
      }
    }

    // Attraction along connections
    connections.forEach((conn) => {
      const source = positions.get(conn.source);
      const target = positions.get(conn.target);
      if (!source || !target) return;

      const dx = target.x - source.x;
      const dy = target.y - source.y;
      const distance = Math.sqrt(dx * dx + dy * dy) || 1;

      const force = distance * attractionForce * conn.strength;
      const fx = (dx / distance) * force;
      const fy = (dy / distance) * force;

      const forceSource = forces.get(conn.source)!;
      const forceTarget = forces.get(conn.target)!;
      forceSource.x += fx;
      forceSource.y += fy;
      forceTarget.x -= fx;
      forceTarget.y -= fy;
    });

    // Center force (pull everything toward center)
    const centerX = width / 2;
    const centerY = height / 2;
    nodes.forEach((node) => {
      const pos = positions.get(node.id)!;
      const force = forces.get(node.id)!;
      force.x += (centerX - pos.x) * centerForce;
      force.y += (centerY - pos.y) * centerForce;
    });

    // Apply forces
    nodes.forEach((node) => {
      const pos = positions.get(node.id)!;
      const force = forces.get(node.id)!;
      pos.x += force.x;
      pos.y += force.y;

      // Keep within bounds
      pos.x = Math.max(50, Math.min(width - 50, pos.x));
      pos.y = Math.max(50, Math.min(height - 50, pos.y));
    });
  }

  return positions;
}

// ============================================================================
// Factory
// ============================================================================

let agentNetworkInstance: AgentNetwork | null = null;

export function getAgentNetwork(): AgentNetwork {
  if (!agentNetworkInstance) {
    agentNetworkInstance = new AgentNetwork();
  }
  return agentNetworkInstance;
}

export function createAgentNetwork(initialData?: AgentNetworkData): AgentNetwork {
  return new AgentNetwork(initialData);
}

export function resetAgentNetwork(): void {
  agentNetworkInstance = null;
}
