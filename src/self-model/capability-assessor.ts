/**
 * Capability Assessor — Evaluates module integration quality
 *
 * Cross-references manifest data and runtime health to assess
 * each module's operational status and integration depth.
 */

import type { ModuleManifestEntry, ModuleHealth, ModuleAssessment, ModuleHealthStatus, IntegrationQuality } from './types.js';
import type { ManifestGenerator } from './manifest-generator.js';
import type { RuntimeObservatory } from './runtime-observatory.js';
import { existsSync, readdirSync } from 'fs';
import { join, resolve } from 'path';

// __dirname is provided natively in CJS

export class CapabilityAssessor {
  private rootPath: string;

  constructor(
    private manifest: ManifestGenerator,
    private observatory: RuntimeObservatory,
    rootPath: string,
  ) {
    this.rootPath = rootPath;
  }

  assessAll(): Map<string, ModuleAssessment> {
    const assessments = new Map<string, ModuleAssessment>();
    const entries = this.manifest.generate();

    for (const entry of entries) {
      const assessment = this.assessEntry(entry);
      assessments.set(entry.name, assessment);
    }

    return assessments;
  }

  assess(moduleName: string): ModuleAssessment {
    const entries = this.manifest.generate();
    const entry = entries.find(e => e.name === moduleName);

    if (!entry) {
      return {
        moduleName,
        status: 'untested',
        integrationQuality: 'disconnected',
        busConnected: false,
        hasTests: false,
        lastKnownSuccess: null,
        errorPatterns: [],
        recommendations: ['Module not found in manifest'],
      };
    }

    return this.assessEntry(entry);
  }

  private assessEntry(entry: ModuleManifestEntry): ModuleAssessment {
    const health = this.observatory.getHealth(entry.name);
    const integrationQuality = this.assessIntegrationQuality(entry, health);
    const hasTests = this.checkForTests(entry.name);
    const errorPatterns = this.extractErrorPatterns(entry.name);
    const recommendations = this.generateRecommendations(
      entry, health, integrationQuality, hasTests,
    );

    return {
      moduleName: entry.name,
      status: health.status,
      integrationQuality,
      busConnected: entry.busTopics.length > 0,
      hasTests,
      lastKnownSuccess: health.lastSuccess,
      errorPatterns,
      recommendations,
    };
  }

  private assessIntegrationQuality(
    entry: ModuleManifestEntry,
    health: ModuleHealth,
  ): IntegrationQuality {
    if (entry.busTopics.length === 0) {
      return 'disconnected';
    }

    if (health.eventCount > 0 && (health.status === 'working' || health.status === 'degraded')) {
      return 'full';
    }

    return 'partial';
  }

  private checkForTests(moduleName: string): boolean {
    const modulePath = join(this.rootPath, 'src', moduleName);

    if (!existsSync(modulePath)) return false;

    try {
      const testsDir = join(modulePath, '__tests__');
      if (existsSync(testsDir)) return true;

      const files = readdirSync(modulePath);
      return files.some(file => file.endsWith('.test.ts'));
    } catch (err) {
      console.error('[CapabilityAssessor] Failed to check for tests:', err);
      return false;
    }
  }

  private extractErrorPatterns(moduleName: string): string[] {
    const errors = this.observatory.getRecentErrors();
    const moduleErrors = errors.filter(err => err.module === moduleName);

    const patterns = new Map<string, number>();
    for (const err of moduleErrors) {
      const pattern = err.error.substring(0, 100);
      patterns.set(pattern, (patterns.get(pattern) || 0) + 1);
    }

    return Array.from(patterns.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([pattern]) => pattern);
  }

  private generateRecommendations(
    entry: ModuleManifestEntry,
    health: ModuleHealth,
    quality: IntegrationQuality,
    hasTests: boolean,
  ): string[] {
    const recommendations: string[] = [];

    if (health.status === 'broken') {
      recommendations.push('Critical: module failing, check error logs');
      if (health.lastError) {
        recommendations.push(`Last error: ${health.lastError.substring(0, 80)}`);
      }
    }

    if (health.status === 'degraded' && health.failureCount > 10) {
      recommendations.push('High failure rate — check for systemic issues');
    }

    if (quality === 'disconnected' && health.status === 'untested') {
      recommendations.push('Wire to bus: add event publishing');
    }

    if (quality === 'partial') {
      recommendations.push('Module wired but dormant — verify initialization');
    }

    if (!hasTests && quality !== 'disconnected') {
      recommendations.push('Add test coverage for active module');
    }

    return recommendations;
  }
}
