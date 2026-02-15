/**
 * Horizon Scanner — Auto-evolving tool ecosystem
 *
 * Runs discovery→evaluate→integrate→prune cycle on a schedule.
 * Uses Expected Free Energy as the universal decision metric.
 */

import { readFileSync } from 'fs';
import { safeJsonParse } from '../utils/safe-json.js';
import { createSubscriber, getEventBus } from '../bus/index.js';
import { getMemorySystem } from '../memory/index.js';
import { toolRegistry } from '../tools/index.js';
import {
  HorizonScannerConfig,
  DEFAULT_SCANNER_CONFIG,
  CandidateCapability,
  CycleSummary,
} from './types.js';
import { DiscoveryLayer } from './discovery.js';
import { EvaluationLayer } from './evaluator.js';
import { IntegrationLayer } from './integrator.js';
import { PruningLayer } from './pruner.js';

export class HorizonScanner {
  private discovery: DiscoveryLayer;
  private evaluator: EvaluationLayer;
  private integrator: IntegrationLayer;
  private pruner: PruningLayer;

  private candidates = new Map<string, CandidateCapability>();
  private scanTimer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(private config: HorizonScannerConfig = DEFAULT_SCANNER_CONFIG) {
    const existingServers = this.loadExistingServers();
    this.discovery = new DiscoveryLayer(config.activeDomains, existingServers);
    this.evaluator = new EvaluationLayer(config, existingServers, new Map());
    this.integrator = new IntegrationLayer();
    this.pruner = new PruningLayer(config);
  }

  start(): void {
    if (this.running) return;
    this.running = true;

    const sub = createSubscriber('horizon-scanner');

    // Track tool usage for pruning decisions
    sub.on('brain.tool.executed', (event) => {
      this.pruner.recordUsage(event.source, event.toolName, event.success, event.durationMs);
    });

    // Run first scan, then on interval
    this.runCycle().catch(console.error);
    this.scanTimer = setInterval(
      () => {
        try {
          this.runCycle().catch(console.error);
        } catch (err) {
          console.error('[horizon-scanner] Timer error:', err);
        }
      },
      this.config.scanIntervalMs,
    );
  }

  stop(): void {
    if (this.scanTimer) {
      clearInterval(this.scanTimer);
      this.scanTimer = null;
    }
    this.running = false;
  }

  async runCycle(): Promise<CycleSummary> {
    const bus = getEventBus();
    const cycleStart = Date.now();
    const summary: CycleSummary = {
      discovered: 0, evaluated: 0, approved: 0, integrated: 0, pruned: 0, durationMs: 0,
    };

    // Phase 1: Discovery
    const newCandidates = await this.discovery.discover(this.config.enabledSources);
    summary.discovered = newCandidates.length;
    for (const c of newCandidates) {
      if (!this.candidates.has(c.id)) this.candidates.set(c.id, c);
    }

    // Phase 2: Evaluation
    const toEvaluate = Array.from(this.candidates.values())
      .filter(c => c.status === 'discovered')
      .slice(0, this.config.maxEvaluationsPerCycle);

    for (const candidate of toEvaluate) {
      candidate.status = 'evaluating';
      const evaluation = await this.evaluator.evaluate(candidate);
      candidate.evaluation = evaluation;

      if (evaluation.decision === 'adopt') {
        candidate.status = 'approved';
        summary.approved++;
      } else if (evaluation.decision === 'reject') {
        candidate.status = 'rejected';
      }
      summary.evaluated++;

      bus.publish('horizon.candidate.evaluated', {
        source: 'horizon-scanner', precision: 0.8,
        candidateId: candidate.id,
        packageName: candidate.packageName,
        category: candidate.category,
        decision: evaluation.decision,
        expectedFreeEnergy: evaluation.expectedFreeEnergy,
      });

      const memory = getMemorySystem();
      memory.remember({
        what: `Horizon Scanner evaluated ${candidate.packageName}: ${evaluation.decision} (EFE=${evaluation.expectedFreeEnergy.toFixed(3)})`,
      });
    }

    // Phase 3: Integration
    const toIntegrate = Array.from(this.candidates.values())
      .filter(c => c.status === 'approved')
      .slice(0, this.config.maxIntegrationsPerCycle);

    for (const candidate of toIntegrate) {
      const plan = this.buildIntegrationPlan(candidate);

      bus.publish('horizon.integration.started', {
        source: 'horizon-scanner', precision: 0.8,
        candidateId: candidate.id,
        packageName: candidate.packageName,
        phase: 'sandbox',
        success: true,
      });

      const sandboxResult = await this.integrator.sandboxTest(plan);
      if (!sandboxResult.allPassed) {
        candidate.status = 'failed';
        bus.publish('horizon.integration.completed', {
          source: 'horizon-scanner', precision: 0.8,
          candidateId: candidate.id,
          packageName: candidate.packageName,
          phase: 'failed',
          success: false,
          error: 'Sandbox tests failed',
        });
        continue;
      }

      if (this.config.requireHumanApproval) {
        candidate.status = 'sandbox-testing';
        // Awaiting human approval via dashboard
      } else {
        candidate.status = 'canary';
        const canaryResult = await this.integrator.deployCanary(plan, () => {});
        if (canaryResult.promoted) {
          await this.integrator.promote(plan);
          candidate.status = 'integrated';
          summary.integrated++;
          bus.publish('horizon.integration.completed', {
            source: 'horizon-scanner', precision: 0.9,
            candidateId: candidate.id,
            packageName: candidate.packageName,
            phase: 'promoted',
            success: true,
          });
        } else {
          await this.integrator.rollback(plan);
          candidate.status = 'failed';
        }
      }
    }

    // Phase 4: Pruning
    const pruningDecisions = this.pruner.analyzePruning();
    for (const decision of pruningDecisions) {
      if (decision.decision !== 'keep') {
        await this.pruner.executePruning(decision);
        summary.pruned++;
        bus.publish('horizon.pruning.decided', {
          source: 'horizon-scanner', precision: 0.7,
          serverName: decision.serverName,
          decision: decision.decision,
          usageScore: decision.usageScore,
          costScore: decision.costScore,
          netValue: decision.netValue,
        });
      }
    }

    summary.durationMs = Date.now() - cycleStart;

    bus.publish('horizon.cycle.completed', {
      source: 'horizon-scanner', precision: 0.9,
      ...summary,
    });

    return summary;
  }

  getCandidates(): CandidateCapability[] {
    return Array.from(this.candidates.values());
  }

  private loadExistingServers(): string[] {
    try {
      const raw = readFileSync('/Users/lucarossignoli/genesis/.mcp.json', 'utf-8');
      const mcpJson = safeJsonParse<{ servers?: Record<string, unknown> }>(raw, { servers: {} });
      return Object.keys(mcpJson.servers ?? {});
    } catch {
      return [];
    }
  }

  private buildIntegrationPlan(candidate: CandidateCapability) {
    return {
      candidateId: candidate.id,
      createdAt: new Date().toISOString(),
      mcpConfig: {
        name: candidate.packageName.replace(/^@.*\//, '').replace('mcp-server-', ''),
        transport: candidate.transport,
        command: 'npx',
        args: ['-y', candidate.packageName],
        description: candidate.description,
        enabled: true,
        category: candidate.category,
        _scanner: {
          addedAt: new Date().toISOString(),
          addedBy: 'horizon-scanner' as const,
          candidateId: candidate.id,
          evaluationScore: candidate.evaluation?.expectedFreeEnergy ?? 0,
        },
      },
      sandboxTests: [{
        id: `smoke-${candidate.id}`,
        description: 'Basic connectivity test',
        toolCall: { server: candidate.packageName, tool: 'list_tools', params: {} },
        expectation: 'returns_result' as const,
        timeoutMs: 15_000,
        postInvariantCheck: true,
      }],
      rollout: {
        type: 'canary' as const,
        canaryPercentage: 10,
        canaryDurationMs: 24 * 60 * 60 * 1000,
        monitorMetrics: ['successRate', 'avgLatencyMs'],
        autoPromote: true,
      },
      rollback: {
        removeMcpConfig: true,
        unregisterTools: [] as string[],
        autoRollbackAfterMs: 48 * 60 * 60 * 1000,
      },
    };
  }
}

// Singleton
let _scanner: HorizonScanner | null = null;

export function getHorizonScanner(config?: HorizonScannerConfig): HorizonScanner {
  if (!_scanner) _scanner = new HorizonScanner(config);
  return _scanner;
}

export function resetHorizonScanner(): void {
  _scanner?.stop();
  _scanner = null;
}

// Re-export types
export * from './types.js';
