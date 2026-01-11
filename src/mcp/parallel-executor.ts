/**
 * Genesis MCP Parallel DAG Executor
 *
 * Dependency-aware parallel execution of MCP tool calls.
 * Analyzes call dependencies and maximizes parallelism.
 *
 * Features:
 * - Automatic dependency detection
 * - Topological sort for execution order
 * - Maximum parallelism within dependency constraints
 * - Execution visualization
 * - Cycle detection
 */

import { MCPServerName } from '../types.js';
import { getMCPClient, MCPCallResult } from './index.js';

// ============================================================================
// Types
// ============================================================================

export interface DAGNode {
  id: string;
  server: MCPServerName;
  tool: string;
  params: Record<string, any> | ((results: Map<string, any>) => Record<string, any>);
  // Node IDs this node depends on
  dependsOn: string[];
  // Priority (higher = execute first among peers)
  priority?: number;
  // Optional timeout for this specific node
  timeout?: number;
}

export interface DAGExecutionResult {
  success: boolean;
  results: Map<string, MCPCallResult>;
  errors: Map<string, Error>;
  executionOrder: string[][];  // Batches of parallel executions
  totalLatency: number;
  parallelismAchieved: number; // Average parallel tasks
}

export interface DAGVisualization {
  nodes: Array<{
    id: string;
    level: number;
    dependsOn: string[];
    status: 'pending' | 'running' | 'completed' | 'failed';
  }>;
  levels: number;
  criticalPath: string[];
}

// ============================================================================
// DAG Executor
// ============================================================================

export class ParallelDAGExecutor {
  private mcpClient = getMCPClient();
  private maxConcurrency: number;

  constructor(maxConcurrency = 10) {
    this.maxConcurrency = maxConcurrency;
  }

  /**
   * Execute a DAG of MCP calls with maximum parallelism
   */
  async execute(nodes: DAGNode[]): Promise<DAGExecutionResult> {
    const startTime = Date.now();
    const results = new Map<string, MCPCallResult>();
    const errors = new Map<string, Error>();
    const executionOrder: string[][] = [];

    // Validate DAG (check for cycles)
    this.detectCycles(nodes);

    // Build execution levels (topological sort)
    const levels = this.buildExecutionLevels(nodes);
    let totalParallel = 0;

    // Execute level by level
    for (const level of levels) {
      const batch: string[] = [];

      // Execute nodes at this level in parallel (respecting max concurrency)
      const chunks = this.chunkArray(level, this.maxConcurrency);

      for (const chunk of chunks) {
        const promises = chunk.map(async (node) => {
          try {
            // Resolve params if they're functions
            const params = typeof node.params === 'function'
              ? node.params(results)
              : node.params;

            const result = await this.executeNode(node, params);
            results.set(node.id, result);

            if (!result.success) {
              errors.set(node.id, new Error(result.error || 'Unknown error'));
            }
          } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            errors.set(node.id, err);
            results.set(node.id, {
              success: false,
              error: err.message,
              server: node.server,
              tool: node.tool,
              mode: 'real',
              latency: 0,
              timestamp: new Date(),
            });
          }
        });

        await Promise.all(promises);
        batch.push(...chunk.map(n => n.id));
        totalParallel += chunk.length;
      }

      executionOrder.push(batch);
    }

    const totalLatency = Date.now() - startTime;
    const parallelismAchieved = totalParallel / executionOrder.length;

    return {
      success: errors.size === 0,
      results,
      errors,
      executionOrder,
      totalLatency,
      parallelismAchieved,
    };
  }

  /**
   * Execute a single node
   */
  private async executeNode(node: DAGNode, params: Record<string, any>): Promise<MCPCallResult> {
    if (node.timeout) {
      return Promise.race([
        this.mcpClient.call(node.server, node.tool, params),
        new Promise<MCPCallResult>((_, reject) =>
          setTimeout(() => reject(new Error('Timeout')), node.timeout)
        ),
      ]);
    }
    return this.mcpClient.call(node.server, node.tool, params);
  }

  /**
   * Build execution levels via topological sort
   */
  private buildExecutionLevels(nodes: DAGNode[]): DAGNode[][] {
    const nodeMap = new Map(nodes.map(n => [n.id, n]));
    const inDegree = new Map<string, number>();
    const levels: DAGNode[][] = [];

    // Calculate in-degrees
    for (const node of nodes) {
      inDegree.set(node.id, node.dependsOn.length);
    }

    // Process level by level
    while (inDegree.size > 0) {
      // Find all nodes with no remaining dependencies
      const readyNodes: DAGNode[] = [];
      for (const [id, degree] of inDegree) {
        if (degree === 0) {
          readyNodes.push(nodeMap.get(id)!);
        }
      }

      if (readyNodes.length === 0 && inDegree.size > 0) {
        throw new Error('Cycle detected in DAG');
      }

      // Sort by priority within level
      readyNodes.sort((a, b) => (b.priority || 0) - (a.priority || 0));

      levels.push(readyNodes);

      // Remove processed nodes and update dependencies
      for (const node of readyNodes) {
        inDegree.delete(node.id);
        // Decrease in-degree of dependents
        for (const otherNode of nodes) {
          if (otherNode.dependsOn.includes(node.id)) {
            inDegree.set(otherNode.id, (inDegree.get(otherNode.id) || 0) - 1);
          }
        }
      }
    }

    return levels;
  }

  /**
   * Detect cycles using DFS
   */
  private detectCycles(nodes: DAGNode[]): void {
    const nodeMap = new Map(nodes.map(n => [n.id, n]));
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    const dfs = (nodeId: string): boolean => {
      visited.add(nodeId);
      recursionStack.add(nodeId);

      const node = nodeMap.get(nodeId);
      if (node) {
        for (const depId of node.dependsOn) {
          if (!visited.has(depId)) {
            if (dfs(depId)) return true;
          } else if (recursionStack.has(depId)) {
            return true; // Cycle found
          }
        }
      }

      recursionStack.delete(nodeId);
      return false;
    };

    for (const node of nodes) {
      if (!visited.has(node.id)) {
        if (dfs(node.id)) {
          throw new Error(`Cycle detected in DAG involving node: ${node.id}`);
        }
      }
    }
  }

  /**
   * Get visualization of DAG structure
   */
  visualize(nodes: DAGNode[]): DAGVisualization {
    const levels = this.buildExecutionLevels(nodes);
    const nodeToLevel = new Map<string, number>();

    levels.forEach((level, idx) => {
      level.forEach(node => nodeToLevel.set(node.id, idx));
    });

    // Find critical path (longest path)
    const criticalPath = this.findCriticalPath(nodes, nodeToLevel);

    return {
      nodes: nodes.map(node => ({
        id: node.id,
        level: nodeToLevel.get(node.id) || 0,
        dependsOn: node.dependsOn,
        status: 'pending',
      })),
      levels: levels.length,
      criticalPath,
    };
  }

  /**
   * Find the critical path (longest dependency chain)
   */
  private findCriticalPath(nodes: DAGNode[], nodeToLevel: Map<string, number>): string[] {
    const nodeMap = new Map(nodes.map(n => [n.id, n]));
    let longestPath: string[] = [];

    const findPath = (nodeId: string, currentPath: string[]): void => {
      const node = nodeMap.get(nodeId);
      if (!node) return;

      currentPath.push(nodeId);

      if (node.dependsOn.length === 0) {
        // Reached a root node
        if (currentPath.length > longestPath.length) {
          longestPath = [...currentPath];
        }
      } else {
        for (const depId of node.dependsOn) {
          findPath(depId, currentPath);
        }
      }

      currentPath.pop();
    };

    // Find leaf nodes (nodes that nothing depends on)
    const hasDependent = new Set<string>();
    for (const node of nodes) {
      for (const depId of node.dependsOn) {
        hasDependent.add(depId);
      }
    }

    const leaves = nodes.filter(n => !hasDependent.has(n.id));

    for (const leaf of leaves) {
      findPath(leaf.id, []);
    }

    return longestPath.reverse();
  }

  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }
}

// ============================================================================
// DAG Builder (Fluent API)
// ============================================================================

export class DAGBuilder {
  private nodes: DAGNode[] = [];

  /**
   * Add a node to the DAG
   */
  node(
    id: string,
    server: MCPServerName,
    tool: string,
    params: DAGNode['params'],
    options: { dependsOn?: string[]; priority?: number; timeout?: number } = {}
  ): DAGBuilder {
    this.nodes.push({
      id,
      server,
      tool,
      params,
      dependsOn: options.dependsOn || [],
      priority: options.priority,
      timeout: options.timeout,
    });
    return this;
  }

  /**
   * Add dependency between nodes
   */
  depend(nodeId: string, ...dependsOnIds: string[]): DAGBuilder {
    const node = this.nodes.find(n => n.id === nodeId);
    if (node) {
      node.dependsOn.push(...dependsOnIds);
    }
    return this;
  }

  /**
   * Build and return the nodes
   */
  build(): DAGNode[] {
    return this.nodes;
  }

  /**
   * Execute the DAG
   */
  async execute(): Promise<DAGExecutionResult> {
    const executor = getDAGExecutor();
    return executor.execute(this.nodes);
  }
}

// ============================================================================
// Singleton & Utilities
// ============================================================================

let executorInstance: ParallelDAGExecutor | null = null;

export function getDAGExecutor(maxConcurrency?: number): ParallelDAGExecutor {
  if (!executorInstance) {
    executorInstance = new ParallelDAGExecutor(maxConcurrency);
  }
  return executorInstance;
}

export function dag(): DAGBuilder {
  return new DAGBuilder();
}

/**
 * Quick parallel execution of independent calls
 */
export async function parallel(
  calls: Array<{
    server: MCPServerName;
    tool: string;
    params: Record<string, any>;
  }>
): Promise<MCPCallResult[]> {
  const nodes = calls.map((call, i) => ({
    id: `call-${i}`,
    server: call.server,
    tool: call.tool,
    params: call.params,
    dependsOn: [],
  }));

  const result = await getDAGExecutor().execute(nodes);
  return Array.from(result.results.values());
}

/**
 * Sequential execution with result passing
 */
export async function sequential(
  calls: Array<{
    server: MCPServerName;
    tool: string;
    params: Record<string, any> | ((prev: any) => Record<string, any>);
  }>
): Promise<MCPCallResult[]> {
  const nodes: DAGNode[] = calls.map((call, i) => ({
    id: `call-${i}`,
    server: call.server,
    tool: call.tool,
    params: typeof call.params === 'function'
      ? (results: Map<string, any>) => {
          const prevResult = i > 0 ? results.get(`call-${i - 1}`)?.data : undefined;
          return (call.params as Function)(prevResult);
        }
      : call.params,
    dependsOn: i > 0 ? [`call-${i - 1}`] : [],
  }));

  const result = await getDAGExecutor().execute(nodes);
  return Array.from(result.results.values());
}
