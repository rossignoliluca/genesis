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
import { existsSync, statSync, readFileSync } from 'fs';
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
    proposals.push(...this.detectMissingShutdown());
    proposals.push(...this.detectUnprotectedTimers());
    proposals.push(...this.detectTodoFixme());
    proposals.push(...this.detectUnhandledAsync());
    proposals.push(...this.detectUnboundedCollections());

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

  // ==========================================================================
  // Structural Code Analysis Detectors
  // ==========================================================================

  /**
   * Detect modules that have start() but no stop()/shutdown()/cleanup().
   * These leak timers/listeners on restart.
   */
  private detectMissingShutdown(): ImprovementProposal[] {
    const proposals: ImprovementProposal[] = [];
    const manifest = this.manifest.generate();

    for (const entry of manifest) {
      if (INFRA_MODULES.has(entry.name) || !entry.hasIndex) continue;

      try {
        const indexPath = join(this.rootPath, 'src', entry.name, 'index.ts');
        const content = readFileSync(indexPath, 'utf-8');

        const hasStart = /\bstart\s*\(/.test(content);
        const hasStop = /\b(stop|shutdown|cleanup|destroy|dispose|close)\s*\(/.test(content);

        if (hasStart && !hasStop) {
          proposals.push({
            id: `proposal-lifecycle-${entry.name}-${Date.now()}`,
            category: 'reliability',
            priority: 0.6,
            title: `Add shutdown to ${entry.name}`,
            description: `Module has start() but no stop/shutdown — resources leak on restart`,
            targetModule: entry.name,
            evidence: `start() found but no stop()/shutdown()/cleanup()/destroy() method`,
            suggestedAction: `Add a shutdown() or stop() method that cleans up timers, listeners, and state`,
            estimatedEffort: 'small',
          });
        }
      } catch {
        // skip unreadable
      }
    }

    return proposals;
  }

  /**
   * Detect setInterval callbacks without try/catch protection.
   * An unhandled throw inside setInterval kills the timer silently.
   */
  private detectUnprotectedTimers(): ImprovementProposal[] {
    const proposals: ImprovementProposal[] = [];
    const manifest = this.manifest.generate();

    for (const entry of manifest) {
      if (INFRA_MODULES.has(entry.name) || !entry.hasIndex) continue;

      try {
        const indexPath = join(this.rootPath, 'src', entry.name, 'index.ts');
        const content = readFileSync(indexPath, 'utf-8');
        const lines = content.split('\n');

        // Find actual setInterval CALLS (not type declarations like ReturnType<typeof setInterval>)
        let hasUnprotected = false;
        const unprotectedLines: number[] = [];
        for (let i = 0; i < lines.length; i++) {
          if (/setInterval\s*\(/.test(lines[i]) && !lines[i].includes('typeof setInterval')) {
            // Look at surrounding 10 lines for try/catch
            const context = lines.slice(i, Math.min(i + 10, lines.length)).join('\n');
            if (!context.includes('try')) {
              hasUnprotected = true;
              unprotectedLines.push(i + 1);
            }
          }
        }

        if (hasUnprotected) {
          proposals.push({
            id: `proposal-safety-${entry.name}-timer-${Date.now()}`,
            category: 'reliability',
            priority: 0.55,
            title: `Protect timer in ${entry.name}`,
            description: `${unprotectedLines.length} setInterval callback(s) without try/catch — unhandled error kills timers silently`,
            targetModule: entry.name,
            evidence: `Unprotected setInterval at line(s): ${unprotectedLines.join(', ')}`,
            suggestedAction: `Wrap each setInterval callback body in try/catch to prevent silent timer death`,
            estimatedEffort: 'small',
          });
        }
      } catch {
        // skip
      }
    }

    return proposals;
  }

  // ==========================================================================
  // TODO/FIXME/HACK Detector
  // ==========================================================================

  /**
   * Detect TODO, FIXME, HACK, XXX comments — these are self-documented tech debt.
   * Only flag HIGH-SIGNAL ones (not trivial notes).
   */
  private detectTodoFixme(): ImprovementProposal[] {
    const proposals: ImprovementProposal[] = [];
    const manifest = this.manifest.generate();

    for (const entry of manifest) {
      if (INFRA_MODULES.has(entry.name) || !entry.hasIndex) continue;

      try {
        const indexPath = join(this.rootPath, 'src', entry.name, 'index.ts');
        const content = readFileSync(indexPath, 'utf-8');
        const lines = content.split('\n');

        const flags: Array<{ line: number; text: string; tag: string }> = [];
        for (let i = 0; i < lines.length; i++) {
          const match = lines[i].match(/\/\/\s*(TODO|FIXME|HACK|XXX)\b[:\s]*(.*)/i);
          if (match) {
            const tag = match[1].toUpperCase();
            const text = match[2].trim();
            // Skip trivial/generic TODOs
            if (text.length < 5) continue;
            flags.push({ line: i + 1, text, tag });
          }
        }

        if (flags.length > 0) {
          const priority = flags.some(f => f.tag === 'FIXME' || f.tag === 'HACK') ? 0.55 : 0.5;
          // Only report if at least one is actionable (FIXME/HACK or TODO with real description)
          const evidence = flags
            .slice(0, 5) // max 5 in evidence
            .map(f => `L${f.line} ${f.tag}: ${f.text.substring(0, 80)}`)
            .join(' | ');

          proposals.push({
            id: `proposal-todo-${entry.name}-${Date.now()}`,
            category: 'reliability',
            priority,
            title: `Resolve ${flags.length} TODO/FIXME in ${entry.name}`,
            description: `${flags.length} flagged comment(s) indicating known tech debt or incomplete work`,
            targetModule: entry.name,
            evidence,
            suggestedAction: `Address the flagged items — implement missing functionality, fix known issues, or remove stale TODO if already done`,
            estimatedEffort: flags.length > 3 ? 'medium' : 'small',
          });
        }
      } catch {
        // skip
      }
    }

    return proposals;
  }

  // ==========================================================================
  // Unhandled Async Detector
  // ==========================================================================

  /**
   * Detect async methods that call external/risky operations without try/catch.
   * Pattern: async method body calls await X() but has no try in the method.
   */
  private detectUnhandledAsync(): ImprovementProposal[] {
    const proposals: ImprovementProposal[] = [];
    const manifest = this.manifest.generate();

    for (const entry of manifest) {
      if (INFRA_MODULES.has(entry.name) || !entry.hasIndex) continue;

      try {
        const indexPath = join(this.rootPath, 'src', entry.name, 'index.ts');
        const content = readFileSync(indexPath, 'utf-8');
        const lines = content.split('\n');

        // Find async methods
        const unhandled: Array<{ line: number; name: string }> = [];
        for (let i = 0; i < lines.length; i++) {
          const asyncMatch = lines[i].match(/async\s+([\w]+)\s*\(/);
          if (!asyncMatch) continue;

          const methodName = asyncMatch[1];
          // Skip test/private helpers
          if (methodName.startsWith('test') || methodName === 'main') continue;

          // Look in the method body (next 30 lines or until next method)
          let hasAwait = false;
          let hasTry = false;
          let depth = 0;
          let started = false;
          let methodLength = 0;

          for (let j = i; j < Math.min(i + 80, lines.length); j++) {
            const line = lines[j];
            for (const ch of line) {
              if (ch === '{') { depth++; started = true; }
              if (ch === '}') depth--;
            }

            if (started) methodLength++;
            if (started && depth === 0) break; // method ended

            if (line.includes('await ')) hasAwait = true;
            if (line.includes('try')) hasTry = true;
          }

          // Skip methods > 40 lines — too long for LLM search/replace
          if (methodLength > 40) continue;

          if (hasAwait && !hasTry) {
            unhandled.push({ line: i + 1, name: methodName });
          }
        }

        if (unhandled.length > 0) {
          const evidence = unhandled
            .slice(0, 4)
            .map(u => `L${u.line} async ${u.name}()`)
            .join(', ');

          proposals.push({
            id: `proposal-async-${entry.name}-${Date.now()}`,
            category: 'reliability',
            priority: 0.5,
            title: `Add error handling in ${entry.name}`,
            description: `${unhandled.length} async method(s) with await but no try/catch — errors crash silently`,
            targetModule: entry.name,
            evidence: `Unprotected async methods: ${evidence}`,
            suggestedAction: `Wrap the await calls in try/catch with appropriate error logging`,
            estimatedEffort: 'small',
          });
        }
      } catch {
        // skip
      }
    }

    return proposals;
  }

  // ==========================================================================
  // Unbounded Collection Detector
  // ==========================================================================

  /**
   * Detect arrays/maps that grow without bound (push/set without max size check).
   * These cause memory leaks over time.
   */
  private detectUnboundedCollections(): ImprovementProposal[] {
    const proposals: ImprovementProposal[] = [];
    const manifest = this.manifest.generate();

    for (const entry of manifest) {
      if (INFRA_MODULES.has(entry.name) || !entry.hasIndex) continue;

      try {
        const indexPath = join(this.rootPath, 'src', entry.name, 'index.ts');
        const content = readFileSync(indexPath, 'utf-8');
        const lines = content.split('\n');

        // Find instance field arrays that get pushed to
        const unbounded: Array<{ line: number; field: string }> = [];

        for (let i = 0; i < lines.length; i++) {
          // Match: this.something.push( or this.something.set(
          const pushMatch = lines[i].match(/this\.([\w]+)\.push\s*\(/);
          const setMatch = lines[i].match(/this\.([\w]+)\.set\s*\(/);
          const match = pushMatch || setMatch;
          if (!match) continue;

          const field = match[1];

          // Skip callback/listener/handler/subscription registrations — these are not logs
          if (/callback|listener|handler|subscriber|watcher|observer|subscription/i.test(field)) continue;
          // Skip task tracking sets (runningTasks, activeTasks) — managed externally
          if (/running|active/i.test(field) && /task/i.test(field)) continue;
          // Skip sensor/effector/agent registrations
          if (/sensors|effectors|agents|cooldowns/i.test(field)) continue;

          // Check if there's a size cap in the surrounding 15 lines
          const context = lines.slice(Math.max(0, i - 5), Math.min(lines.length, i + 10)).join('\n');
          const hasCap = (context.includes('.length') || context.includes('.size')) && (
            context.includes('.shift()') ||
            context.includes('.splice(') ||
            context.includes('.slice(') ||
            context.includes('.delete(') ||
            context.includes('.clear()') ||
            />\s*\d+/.test(context) // some numeric comparison
          );

          // Also skip if `maxHistory` or `MAX_` or `limit` or a size cap is nearby
          const hasLimit = /max|limit|cap|MAX_|\.size\s*>/i.test(context);

          if (!hasCap && !hasLimit) {
            // Avoid duplicates for same field
            if (!unbounded.some(u => u.field === field)) {
              unbounded.push({ line: i + 1, field });
            }
          }
        }

        if (unbounded.length > 0) {
          const evidence = unbounded
            .slice(0, 4)
            .map(u => `L${u.line} this.${u.field}`)
            .join(', ');

          proposals.push({
            id: `proposal-unbounded-${entry.name}-${Date.now()}`,
            category: 'reliability',
            priority: 0.5,
            title: `Cap unbounded collection in ${entry.name}`,
            description: `${unbounded.length} collection(s) grow without size limit — potential memory leak`,
            targetModule: entry.name,
            evidence: `Unbounded: ${evidence}`,
            suggestedAction: `Add size checks after push/set — e.g., if (this.arr.length > MAX) this.arr.shift()`,
            estimatedEffort: 'small',
          });
        }
      } catch {
        // skip
      }
    }

    return proposals;
  }
}
