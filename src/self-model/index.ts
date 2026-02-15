/**
 * Holistic Self-Model — Orchestrator
 *
 * Provides Genesis with persistent, compressed self-awareness.
 * Auto-discovers all modules, tracks runtime health via bus events,
 * and generates a ~4KB self-briefing for context injection.
 *
 * Usage:
 * ```typescript
 * import { getHolisticSelfModel } from './self-model/index.js';
 *
 * const self = getHolisticSelfModel();
 * await self.boot();
 *
 * // Get compressed holistic briefing
 * const md = self.getBriefingMarkdown();
 *
 * // Check module health
 * const health = self.getHealth('kernel');
 *
 * // Get improvement proposals
 * const proposals = self.proposeImprovements();
 * ```
 */

import { resolve } from 'path';
import { ManifestGenerator, getManifestGenerator } from './manifest-generator.js';
import { RuntimeObservatory, getRuntimeObservatory } from './runtime-observatory.js';
import { CapabilityAssessor } from './capability-assessor.js';
import { ImprovementProposer } from './improvement-proposer.js';
import { SelfBriefingGenerator } from './self-briefing.js';
import type {
  SelfBriefing,
  ModuleHealth,
  ModuleAssessment,
  ImprovementProposal,
  ModuleManifestEntry,
  HolisticSelfModelConfig,
} from './types.js';
import { DEFAULT_SELF_MODEL_CONFIG } from './types.js';

// Re-export types
export type {
  SelfBriefing,
  ModuleHealth,
  ModuleAssessment,
  ImprovementProposal,
  ModuleManifestEntry,
  ModuleHealthStatus,
  IntegrationQuality,
  ArchitectureLayer,
  RuntimeSnapshot,
  PersistedSelfModel,
  SessionLogEntry,
  HolisticSelfModelConfig,
} from './types.js';

// Re-export components
export { ManifestGenerator, getManifestGenerator } from './manifest-generator.js';
export { RuntimeObservatory, getRuntimeObservatory } from './runtime-observatory.js';
export { CapabilityAssessor } from './capability-assessor.js';
export { ImprovementProposer } from './improvement-proposer.js';
export { SelfBriefingGenerator } from './self-briefing.js';

const __dirname = resolve(__filename, '..');

// ============================================================================
// Holistic Self-Model
// ============================================================================

export class HolisticSelfModel {
  private config: HolisticSelfModelConfig;
  private manifest: ManifestGenerator;
  private observatory: RuntimeObservatory;
  private assessor: CapabilityAssessor;
  private proposer: ImprovementProposer;
  private briefingGen: SelfBriefingGenerator;

  private booted = false;
  private cachedBriefing: SelfBriefing | null = null;
  private persistTimer: NodeJS.Timeout | null = null;

  constructor(config?: Partial<HolisticSelfModelConfig>) {
    const rootPath = config?.rootPath || resolve(__dirname, '../..');
    this.config = {
      ...DEFAULT_SELF_MODEL_CONFIG,
      ...config,
      rootPath,
      persistPath: config?.persistPath || resolve(rootPath, '.genesis/holistic-self-model.json'),
    };

    this.manifest = getManifestGenerator(this.config.rootPath);
    this.observatory = getRuntimeObservatory(this.config.persistPath);
    this.assessor = new CapabilityAssessor(this.manifest, this.observatory, this.config.rootPath);
    this.proposer = new ImprovementProposer(this.manifest, this.observatory, this.assessor, this.config.rootPath);
    this.briefingGen = new SelfBriefingGenerator(
      this.manifest, this.observatory, this.assessor, this.proposer, this.config.rootPath,
    );
  }

  /**
   * Boot: load persisted state and start bus subscriptions
   */
  async boot(): Promise<void> {
    if (this.booted) return;

    this.observatory.start();
    this.booted = true;

    // Start periodic persistence
    if (this.config.persistIntervalMs > 0) {
      this.persistTimer = setInterval(() => {
        this.observatory.persist();
      }, this.config.persistIntervalMs);
    }
  }

  /**
   * Check if the self-model has booted
   */
  isBooted(): boolean {
    return this.booted;
  }

  /**
   * Refresh: re-scan manifest, regenerate briefing
   */
  refresh(): SelfBriefing {
    this.cachedBriefing = this.briefingGen.generate();
    return this.cachedBriefing;
  }

  /**
   * Get the current self-briefing (cached, regenerated on refresh)
   */
  getBriefing(): SelfBriefing {
    if (!this.cachedBriefing) {
      this.cachedBriefing = this.briefingGen.generate();
    }
    return this.cachedBriefing;
  }

  /**
   * Get briefing markdown string for context injection (~4KB)
   */
  getBriefingMarkdown(): string {
    return this.getBriefing().markdown;
  }

  /**
   * Get health for a specific module
   */
  getHealth(moduleName: string): ModuleHealth {
    return this.observatory.getHealth(moduleName);
  }

  /**
   * Get all module health statuses
   */
  getAllHealth(): Record<string, ModuleHealth> {
    return this.observatory.getSnapshot().health;
  }

  /**
   * Assess a specific module
   */
  assessModule(moduleName: string): ModuleAssessment {
    return this.assessor.assess(moduleName);
  }

  /**
   * Get all module assessments
   */
  assessAll(): Map<string, ModuleAssessment> {
    return this.assessor.assessAll();
  }

  /**
   * Generate improvement proposals
   */
  proposeImprovements(): ImprovementProposal[] {
    return this.proposer.propose();
  }

  /**
   * Get module manifest (all discovered modules)
   */
  getManifest(): ModuleManifestEntry[] {
    return this.manifest.generate();
  }

  /**
   * Persist current state to disk
   */
  persist(): void {
    this.observatory.persist();
  }

  /**
   * Shutdown: persist and unsubscribe
   */
  async shutdown(): Promise<void> {
    if (this.persistTimer) {
      clearInterval(this.persistTimer);
      this.persistTimer = null;
    }
    this.observatory.shutdown();
    this.booted = false;
  }
}

// ============================================================================
// Singleton
// ============================================================================

let instance: HolisticSelfModel | null = null;

export function getHolisticSelfModel(config?: Partial<HolisticSelfModelConfig>): HolisticSelfModel {
  if (!instance) {
    instance = new HolisticSelfModel(config);
  }
  return instance;
}

export function resetHolisticSelfModel(): void {
  if (instance) {
    instance.shutdown();
    instance = null;
  }
}
