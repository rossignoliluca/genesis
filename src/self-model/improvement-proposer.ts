/**
 * Improvement Proposer — Rule-based improvement detection
 *
 * Analyzes module health and integration quality to generate
 * concrete improvement proposals sorted by priority.
 */

import type { ImprovementProposal } from './types.js';
import type { ManifestGenerator } from './manifest-generator.js';
import type { RuntimeObservatory } from './runtime-observatory.js';
import type { CapabilityAssessor } from './capability-assessor.js';
import { existsSync, statSync } from 'fs';
import { join } from 'path';
import type { ModuleManifestEntry } from './types.js';

// Infrastructure modules that don't need bus topics — they ARE the infrastructure
const INFRA_MODULES = new Set([
  'bus', 'di', 'config', 'utils', 'hooks', 'lifecycle', 'persistence',
  'streaming', 'concurrency', 'pipeline', 'sync', 'api', 'ui',
  'deployment', 'dashboard', 'observability', 'integration', 'integrations',
  'execution', 'tools', 'subagents', 'agents', 'mcp', 'mcp-server',
  'mcp-servers', 'mcp-finance', 'llm', 'embeddings', 'services',
  'self-model', 'presentation', 'governance',
]);

export class ImprovementProposer {
  constructor(
    private manifest: ManifestGenerator,
    private observatory: RuntimeObservatory,
    private assessor: CapabilityAssessor,
    private rootPath: string,
  ) {}

  propose(): ImprovementProposal[] {
    const proposals: ImprovementProposal[] = [];

    proposals.push(...this.detectUnwiredModules());
    proposals.push(...this.detectBrokenModules());
    proposals.push(...this.detectDegradedModules());
    proposals.push(...this.detectStaleSelfModel());
    proposals.push(...this.detectDormantModules());

    return proposals
      .sort((a, b) => b.priority - a.priority)
      .slice(0, 10);
  }

  private detectUnwiredModules(): ImprovementProposal[] {
    const assessments = this.assessor.assessAll();
    const manifest = this.manifest.generate();
    const manifestMap = new Map<string, ModuleManifestEntry>(manifest.map(m => [m.name, m]));

    // Exclude infrastructure modules + modules without index.ts (fix-generator targets index.ts)
    const unwired = Array.from(assessments.values()).filter(a => {
      if (INFRA_MODULES.has(a.moduleName)) return false;
      if (a.integrationQuality !== 'disconnected') return false;
      const entry = manifestMap.get(a.moduleName);
      if (!entry || !entry.hasIndex) return false;
      return true;
    });

    if (unwired.length === 0) return [];

    // Generate individual proposals — one per module so the loop can fix them one by one
    return unwired.map(a => ({
      id: `proposal-wiring-${a.moduleName}-${Date.now()}`,
      category: 'wiring' as const,
      priority: 0.5,
      title: `Wire ${a.moduleName} to bus`,
      description: `Module has no bus topics defined, integration quality: disconnected`,
      targetModule: a.moduleName,
      evidence: `No bus event prefixes mapped for ${a.moduleName}`,
      suggestedAction: `Add event publishing to ${a.moduleName} — import createPublisher from '../bus/index.js' and emit an init event`,
      estimatedEffort: 'medium' as const,
    }));
  }

  private detectBrokenModules(): ImprovementProposal[] {
    const assessments = this.assessor.assessAll();
    const broken = Array.from(assessments.values()).filter(
      a => a.status === 'broken',
    );

    return broken.map(a => {
      const health = this.observatory.getHealth(a.moduleName);
      return {
        id: `proposal-reliability-${a.moduleName}-${Date.now()}`,
        category: 'reliability' as const,
        priority: 0.9,
        title: `Fix broken module: ${a.moduleName}`,
        description: `Module status: broken with ${health.failureCount} failures`,
        targetModule: a.moduleName,
        evidence: health.lastError
          ? `Last error: ${health.lastError.substring(0, 100)}`
          : `${health.failureCount} failures detected`,
        suggestedAction: a.errorPatterns.length > 0
          ? `Address recurring error: ${a.errorPatterns[0]}`
          : `Investigate module initialization and dependency chain`,
        estimatedEffort: 'small' as const,
      };
    });
  }

  private detectDegradedModules(): ImprovementProposal[] {
    const assessments = this.assessor.assessAll();
    const degraded = Array.from(assessments.values()).filter(a => {
      const health = this.observatory.getHealth(a.moduleName);
      return a.status === 'degraded' && health.failureCount > 5;
    });

    return degraded.map(a => {
      const health = this.observatory.getHealth(a.moduleName);
      return {
        id: `proposal-reliability-${a.moduleName}-${Date.now()}`,
        category: 'reliability' as const,
        priority: 0.7,
        title: `Stabilize degraded module: ${a.moduleName}`,
        description: `${health.failureCount} failures, health score: ${health.healthScore.toFixed(2)}`,
        targetModule: a.moduleName,
        evidence: `Health score: ${health.healthScore.toFixed(2)}, failures: ${health.failureCount}`,
        suggestedAction: a.errorPatterns.length > 0
          ? `Add retry/circuit breaker for: ${a.errorPatterns[0]}`
          : `Review error logs and add defensive handling`,
        estimatedEffort: 'small' as const,
      };
    });
  }

  private detectStaleSelfModel(): ImprovementProposal[] {
    const modelPath = join(this.rootPath, '.genesis', 'holistic-self-model.json');

    if (!existsSync(modelPath)) {
      return [{
        id: `proposal-capability-self-model-${Date.now()}`,
        category: 'capability',
        priority: 0.2,
        title: 'Persist self-model state to disk',
        description: 'No persisted self-model found — cross-session memory not yet active',
        targetModule: 'self-model',
        evidence: 'No .genesis/holistic-self-model.json found',
        suggestedAction: 'Boot self-model with bus running to accumulate health data, then persist',
        estimatedEffort: 'trivial',
      }];
    }

    try {
      const stats = statSync(modelPath);
      const ageInDays = (Date.now() - stats.mtimeMs) / (1000 * 60 * 60 * 24);

      if (ageInDays > 7) {
        return [{
          id: `proposal-capability-self-model-${Date.now()}`,
          category: 'capability',
          priority: 0.3,
          title: 'Refresh stale self-model',
          description: `Self-model is ${Math.floor(ageInDays)} days old`,
          targetModule: 'self-model',
          evidence: `Last updated: ${stats.mtime.toISOString()}`,
          suggestedAction: 'Regenerate self-model to reflect current state',
          estimatedEffort: 'trivial',
        }];
      }
    } catch {
      // Can't stat — treat as non-existent
    }

    return [];
  }

  private detectDormantModules(): ImprovementProposal[] {
    const assessments = this.assessor.assessAll();
    const dormant = Array.from(assessments.values()).filter(
      a => a.status === 'dormant',
    );

    if (dormant.length === 0) return [];

    if (dormant.length <= 5) {
      return dormant.map(a => ({
        id: `proposal-integration-${a.moduleName}-${Date.now()}`,
        category: 'integration' as const,
        priority: 0.4,
        title: `Activate dormant module: ${a.moduleName}`,
        description: `Module initialized but no recent events`,
        targetModule: a.moduleName,
        evidence: `Status: dormant, integration: ${a.integrationQuality}`,
        suggestedAction: a.integrationQuality === 'partial'
          ? `Check initialization order and event routing`
          : `Verify startup hooks and enable if needed`,
        estimatedEffort: 'small' as const,
      }));
    }

    const names = dormant.map(a => a.moduleName).join(', ');
    return [{
      id: `proposal-integration-bulk-${Date.now()}`,
      category: 'integration',
      priority: 0.4,
      title: `${dormant.length} modules dormant — check initialization`,
      description: `Multiple modules initialized but inactive`,
      targetModule: dormant[0].moduleName,
      evidence: `Dormant: ${names}`,
      suggestedAction: `Review lifecycle initialization sequence`,
      estimatedEffort: 'medium',
    }];
  }
}
