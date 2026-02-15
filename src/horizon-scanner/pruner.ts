/**
 * Self-Pruning Layer — Via Negativa for Tool Ecology
 * Removes unused/costly MCP servers. Core servers are protected.
 */

import { readFile, writeFile } from 'fs/promises';
import { ToolUsageRecord, PruningDecision, HorizonScannerConfig } from './types.js';

export class PruningLayer {
  private usageRecords = new Map<string, ToolUsageRecord>();

  constructor(private config: HorizonScannerConfig) {}

  recordUsage(serverName: string, toolName: string, success: boolean, latencyMs: number): void {
    const key = `${serverName}:${toolName}`;
    const existing = this.usageRecords.get(key) ?? {
      serverName,
      toolName,
      invocations30d: 0,
      successRate30d: 1.0,
      avgLatencyMs: 0,
      totalCost30d: 0,
      lastUsed: new Date().toISOString(),
      daysSinceLastUse: 0,
    };

    existing.invocations30d++;
    existing.successRate30d = (
      existing.successRate30d * (existing.invocations30d - 1) + (success ? 1 : 0)
    ) / existing.invocations30d;
    existing.avgLatencyMs = (
      existing.avgLatencyMs * (existing.invocations30d - 1) + latencyMs
    ) / existing.invocations30d;
    existing.lastUsed = new Date().toISOString();
    existing.daysSinceLastUse = 0;

    this.usageRecords.set(key, existing);
  }

  analyzePruning(): PruningDecision[] {
    const decisions: PruningDecision[] = [];
    const totalServers = this.getUniqueServers().size;
    const complexityTax = totalServers / this.config.maxMcpServers;

    const coreServers = ['filesystem', 'memory', 'brave-search', 'sequential-thinking'];

    for (const [, record] of this.usageRecords) {
      const usageScore = this.computeUsageScore(record);
      const costScore = this.computeCostScore(record, complexityTax);
      const netValue = usageScore - costScore;
      const pruneThreshold = -0.1;

      let decision: 'keep' | 'disable' | 'remove';
      if (netValue > 0.2) decision = 'keep';
      else if (netValue > pruneThreshold) decision = 'disable';
      else decision = 'remove';

      // Never prune core infrastructure
      if (coreServers.includes(record.serverName)) decision = 'keep';

      decisions.push({
        serverName: record.serverName,
        decision,
        reasoning: `${record.serverName}: ${decision} (usage=${usageScore.toFixed(2)}, ` +
          `cost=${costScore.toFixed(2)}, invocations=${record.invocations30d})`,
        usageScore,
        costScore,
        netValue,
        pruneThreshold,
      });
    }

    return decisions;
  }

  async executePruning(
    decision: PruningDecision,
    mcpJsonPath = '/Users/lucarossignoli/genesis/.mcp.json',
  ): Promise<void> {
    if (decision.decision === 'keep') return;

    const raw = await readFile(mcpJsonPath, 'utf-8');
    const mcpJson = JSON.parse(raw);

    if (decision.decision === 'disable') {
      if (mcpJson.servers[decision.serverName]) {
        mcpJson.servers[decision.serverName].enabled = false;
      }
    } else if (decision.decision === 'remove') {
      delete mcpJson.servers[decision.serverName];
    }

    await writeFile(mcpJsonPath, JSON.stringify(mcpJson, null, 2) + '\n', 'utf-8');
  }

  private computeUsageScore(record: ToolUsageRecord): number {
    let score = 0;
    score += Math.min(0.4, Math.log10(record.invocations30d + 1) / 5);
    score += record.successRate30d * 0.3;
    score += Math.exp(-record.daysSinceLastUse / 7) * 0.3;
    return Math.min(1.0, score);
  }

  private computeCostScore(record: ToolUsageRecord, complexityTax: number): number {
    let cost = 0;
    cost += complexityTax * 0.2;
    if (record.avgLatencyMs > 5000) cost += 0.2;
    cost += 0.05;
    return Math.min(1.0, cost);
  }

  private getUniqueServers(): Set<string> {
    const servers = new Set<string>();
    for (const [, record] of this.usageRecords) servers.add(record.serverName);
    return servers;
  }
}
