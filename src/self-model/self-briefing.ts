/**
 * Self-Briefing Generator — Compressed holistic view (~4KB markdown)
 *
 * THE key output of the self-model system. Generates a dense, actionable
 * briefing that gives Claude instant holistic understanding of Genesis.
 */

import type {
  SelfBriefing,
  ArchitectureLayer,
  ModuleManifestEntry,
  ImprovementProposal,
  ModuleAssessment,
} from './types.js';
import type { ManifestGenerator } from './manifest-generator.js';
import type { RuntimeObservatory } from './runtime-observatory.js';
import type { CapabilityAssessor } from './capability-assessor.js';
import type { ImprovementProposer } from './improvement-proposer.js';
import { readFileSync } from 'fs';
import { join, resolve } from 'path';

// ============================================================================
// Layer Classification
// ============================================================================

const LAYER_MAP: Record<string, string> = {
  // L1 Autonomic
  kernel: 'L1 Autonomic', neuromodulation: 'L1 Autonomic', nociception: 'L1 Autonomic',
  allostasis: 'L1 Autonomic', daemon: 'L1 Autonomic', governance: 'L1 Autonomic',
  lifecycle: 'L1 Autonomic', hooks: 'L1 Autonomic',
  // L2 Perception
  consciousness: 'L2 Perception', memory: 'L2 Perception', 'memory-production': 'L2 Perception',
  'world-model': 'L2 Perception', brain: 'L2 Perception', perception: 'L2 Perception',
  umwelt: 'L2 Perception', embodiment: 'L2 Perception', embeddings: 'L2 Perception',
  // L3 Reasoning
  thinking: 'L3 Reasoning', causal: 'L3 Reasoning', reasoning: 'L3 Reasoning',
  grounding: 'L3 Reasoning', 'active-inference': 'L3 Reasoning', agents: 'L3 Reasoning',
  subagents: 'L3 Reasoning', metacognition: 'L3 Reasoning', epistemic: 'L3 Reasoning',
  uncertainty: 'L3 Reasoning',
  // L4 Self-Modification
  'self-modification': 'L4 Self-Mod', rsi: 'L4 Self-Mod', autopoiesis: 'L4 Self-Mod',
  'strange-loop': 'L4 Self-Mod', 'tool-factory': 'L4 Self-Mod', 'horizon-scanner': 'L4 Self-Mod',
  antifragile: 'L4 Self-Mod', healing: 'L4 Self-Mod', learning: 'L4 Self-Mod',
  'self-model': 'L4 Self-Mod', autonomous: 'L4 Self-Mod',
  // L5 External
  mcp: 'L5 External', 'mcp-server': 'L5 External', 'mcp-servers': 'L5 External',
  'mcp-finance': 'L5 External', llm: 'L5 External', tools: 'L5 External',
  'market-strategist': 'L5 External', content: 'L5 External', presentation: 'L5 External',
  finance: 'L5 External', revenue: 'L5 External', payments: 'L5 External',
  economy: 'L5 External', a2a: 'L5 External', services: 'L5 External',
  // L6 Infrastructure
  bus: 'L6 Infra', integration: 'L6 Infra', integrations: 'L6 Infra',
  observability: 'L6 Infra', dashboard: 'L6 Infra', api: 'L6 Infra',
  di: 'L6 Infra', streaming: 'L6 Infra', concurrency: 'L6 Infra',
  pipeline: 'L6 Infra', deployment: 'L6 Infra', sync: 'L6 Infra',
  cli: 'L6 Infra', persistence: 'L6 Infra', ui: 'L6 Infra', execution: 'L6 Infra',
  // L7 Cognitive
  semiotics: 'L7 Cognitive', morphogenetic: 'L7 Cognitive', swarm: 'L7 Cognitive',
  symbiotic: 'L7 Cognitive', 'second-order': 'L7 Cognitive', exotic: 'L7 Cognitive',
  organism: 'L7 Cognitive',
};

const LAYER_ORDER = [
  'L1 Autonomic', 'L2 Perception', 'L3 Reasoning',
  'L4 Self-Mod', 'L5 External', 'L6 Infra', 'L7 Cognitive',
];

// ============================================================================
// Self-Briefing Generator
// ============================================================================

export class SelfBriefingGenerator {
  private rootPath: string;

  constructor(
    private manifest: ManifestGenerator,
    private observatory: RuntimeObservatory,
    private assessor: CapabilityAssessor,
    private proposer: ImprovementProposer,
    rootPath: string,
  ) {
    this.rootPath = rootPath;
  }

  generate(): SelfBriefing {
    const entries = this.manifest.generate();
    const assessments = this.assessor.assessAll();
    const proposals = this.proposer.propose();
    const layers = this.buildArchitectureLayers(entries);
    const snapshot = this.observatory.getSnapshot();
    const recentErrors = this.observatory.getRecentErrors().slice(0, 10);

    // Group by status
    const working: string[] = [];
    const degraded: Array<{ name: string; detail: string }> = [];
    const broken: Array<{ name: string; detail: string }> = [];
    const untested: string[] = [];
    const dormant: string[] = [];

    for (const [name, assessment] of Array.from(assessments.entries())) {
      const health = this.observatory.getHealth(name);
      switch (assessment.status) {
        case 'working':
          working.push(name);
          break;
        case 'degraded':
          degraded.push({ name, detail: `${health.healthScore.toFixed(2)}, ${health.failureCount} failures` });
          break;
        case 'broken':
          broken.push({ name, detail: `${health.lastError?.substring(0, 60) || 'unknown'}, ${health.failureCount} failures` });
          break;
        case 'untested':
          untested.push(name);
          break;
        case 'dormant':
          dormant.push(name);
          break;
      }
    }

    const sessionEntry = this.observatory.getSessionEntry();
    const markdown = this.buildMarkdown(
      entries.length, layers, working, degraded, broken, untested, dormant,
      recentErrors, proposals, snapshot, sessionEntry,
    );

    return {
      generatedAt: new Date().toISOString(),
      version: this.getVersion(),
      moduleCount: entries.length,
      architecture: { layers },
      healthDashboard: { working, degraded, broken, untested, dormant },
      recentFailures: recentErrors.slice(0, 5).map(e => ({
        module: e.module,
        error: e.error,
        when: e.timestamp,
      })),
      improvements: proposals,
      sessionHistory: {
        lastRefresh: new Date().toISOString(),
        totalSessions: 0,
        totalEvents: snapshot.totalEvents,
      },
      markdown,
    };
  }

  generateMarkdown(): string {
    return this.generate().markdown;
  }

  private buildMarkdown(
    moduleCount: number,
    layers: ArchitectureLayer[],
    working: string[],
    degraded: Array<{ name: string; detail: string }>,
    broken: Array<{ name: string; detail: string }>,
    untested: string[],
    dormant: string[],
    recentErrors: Array<{ module: string; error: string; timestamp: string }>,
    proposals: ImprovementProposal[],
    snapshot: import('./types.js').RuntimeSnapshot,
    sessionEntry: import('./types.js').SessionLogEntry,
  ): string {
    const lines: string[] = [];

    // Header
    const version = this.getVersion();
    lines.push(`# Genesis Self-Briefing (${new Date().toISOString()})`);
    lines.push(`v${version} | ${moduleCount} modules | Uptime: ${this.formatUptime()}`);
    lines.push('');

    // Architecture
    lines.push(`## Architecture (${layers.length} layers, ${moduleCount} modules)`);
    for (const layer of layers) {
      lines.push(`${layer.name}: ${layer.modules.join(', ')}`);
    }
    lines.push('');

    // Health Dashboard
    lines.push('## Health Dashboard');

    if (working.length > 0) {
      lines.push(`WORKING (${working.length}): ${this.compress(working, 80)}`);
    }
    if (degraded.length > 0) {
      lines.push(`DEGRADED (${degraded.length}):`);
      for (const d of degraded) {
        lines.push(`  ${d.name} (${d.detail})`);
      }
    }
    if (broken.length > 0) {
      lines.push(`BROKEN (${broken.length}):`);
      for (const b of broken) {
        lines.push(`  ${b.name} (${b.detail})`);
      }
    }
    if (untested.length > 0) {
      lines.push(`UNTESTED (${untested.length}): ${this.compress(untested, 80)}`);
    }
    if (dormant.length > 0) {
      lines.push(`DORMANT (${dormant.length}): ${this.compress(dormant, 80)}`);
    }
    lines.push('');

    // Recent Failures
    const errors = recentErrors.slice(0, 5);
    if (errors.length > 0) {
      lines.push('## Recent Failures');
      for (const err of errors) {
        const when = this.relativeTime(err.timestamp);
        lines.push(`- [${err.module}] ${err.error.substring(0, 80)} (${when})`);
      }
      lines.push('');
    }

    // Improvements
    const topProposals = proposals.slice(0, 5);
    if (topProposals.length > 0) {
      lines.push('## Improvement Opportunities');
      for (const p of topProposals) {
        const prio = p.priority >= 0.8 ? 'HIGH' : p.priority >= 0.5 ? 'MED' : 'LOW';
        lines.push(`- [${prio}] [${p.category}] ${p.title}`);
      }
      lines.push('');
    }

    // Session Stats
    lines.push('## Session Stats');
    lines.push(`Events: ${snapshot.totalEvents} | Errors: ${sessionEntry.errorsDetected} | Active modules: ${snapshot.modulesActive}`);

    return lines.join('\n');
  }

  private buildArchitectureLayers(entries: ModuleManifestEntry[]): ArchitectureLayer[] {
    const layerModules = new Map<string, string[]>();

    for (const entry of entries) {
      const layerName = LAYER_MAP[entry.name] || 'Discovered';
      if (!layerModules.has(layerName)) {
        layerModules.set(layerName, []);
      }
      layerModules.get(layerName)!.push(entry.name);
    }

    const layers: ArchitectureLayer[] = [];
    for (const name of [...LAYER_ORDER, 'Discovered']) {
      const modules = layerModules.get(name);
      if (modules && modules.length > 0) {
        layers.push({ name, modules: modules.sort() });
      }
    }

    return layers;
  }

  private compress(items: string[], maxChars: number): string {
    const joined = items.join(', ');
    if (joined.length <= maxChars) return joined;

    let result = '';
    for (const item of items) {
      if (result.length + item.length + 2 > maxChars - 3) {
        return result + '...';
      }
      result += (result ? ', ' : '') + item;
    }
    return result;
  }

  private formatUptime(): string {
    const s = process.uptime();
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return `${h}h ${m}m`;
  }

  private relativeTime(timestamp: string): string {
    const diff = Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000);
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  }

  private getVersion(): string {
    try {
      const pkg = JSON.parse(readFileSync(join(this.rootPath, 'package.json'), 'utf-8'));
      return pkg.version || '0.0.0';
    } catch {
      return '0.0.0';
    }
  }
}
