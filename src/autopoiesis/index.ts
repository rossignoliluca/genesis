/**
 * Genesis - Autopoiesis Module
 *
 * TRUE autopoiesis: continuous self-observation, self-modeling, and self-production.
 *
 * The autopoietic loop:
 * 1. OBSERVE SELF - Gather metrics about own code, performance, memory, consciousness
 * 2. UPDATE SELF-MODEL - Store observations in MCP memory graph
 * 3. SELECT SELF-ACTION - Active Inference chooses improvement action
 * 4. EXECUTE MODIFICATION - Apply change through Darwin-Gödel pipeline
 * 5. REPEAT - Continuous cycle of self-creation
 *
 * Key insight from Maturana & Varela: An autopoietic system continuously
 * produces the components that constitute it. Genesis must continuously
 * update its self-model and produce improvements to itself.
 *
 * @module autopoiesis
 */

import { getMCPClient, IMCPClient } from '../mcp/index.js';
import { getMemorySystem, MemorySystem } from '../memory/index.js';
import { getConsciousnessSystem, ConsciousnessSystem } from '../consciousness/index.js';
import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// Types
// ============================================================================

export interface SelfObservation {
  timestamp: Date;
  category: 'code' | 'performance' | 'memory' | 'consciousness' | 'learning' | 'economic';
  metric: string;
  value: number | string | boolean;
  trend?: 'improving' | 'stable' | 'degrading';
  surprise?: number; // How unexpected was this observation?
}

export interface SelfModelUpdate {
  entityName: string;
  observation: string;
  confidence: number;
}

export interface AutopoiesisConfig {
  observationIntervalMs: number;  // How often to observe self
  modelUpdateThreshold: number;   // Minimum change to trigger model update
  modificationThreshold: number;  // φ threshold for self-modification
  mcpMemoryEnabled: boolean;      // Store self-model in MCP memory
  learningEnabled: boolean;       // Learn from self-modification outcomes
}

export const DEFAULT_AUTOPOIESIS_CONFIG: AutopoiesisConfig = {
  observationIntervalMs: 60_000,  // Every minute
  modelUpdateThreshold: 0.1,
  modificationThreshold: 0.3,
  mcpMemoryEnabled: true,
  learningEnabled: true,
};

// ============================================================================
// Self-Observation Functions
// ============================================================================

/**
 * Observe Genesis's own code state
 */
export async function observeCode(): Promise<SelfObservation[]> {
  const observations: SelfObservation[] = [];
  const srcDir = path.resolve(process.cwd(), 'src');

  try {
    // Count TypeScript files
    const countFiles = (dir: string): number => {
      let count = 0;
      try {
        const items = fs.readdirSync(dir);
        for (const item of items) {
          const fullPath = path.join(dir, item);
          const stat = fs.statSync(fullPath);
          if (stat.isDirectory()) {
            count += countFiles(fullPath);
          } else if (item.endsWith('.ts')) {
            count++;
          }
        }
      } catch (e) { console.debug('[Autopoiesis] Dir scan failed:', (e as Error)?.message); }
      return count;
    };

    const fileCount = countFiles(srcDir);
    observations.push({
      timestamp: new Date(),
      category: 'code',
      metric: 'typescript_file_count',
      value: fileCount,
    });

    // Check if build is recent
    const distDir = path.resolve(process.cwd(), 'dist');
    try {
      const distStat = fs.statSync(distDir);
      const buildAge = Date.now() - distStat.mtimeMs;
      observations.push({
        timestamp: new Date(),
        category: 'code',
        metric: 'build_age_hours',
        value: Math.round(buildAge / 3600000),
        trend: buildAge < 86400000 ? 'stable' : 'degrading',
      });
    } catch (e) { console.debug('[Autopoiesis] Dist check skipped:', (e as Error)?.message); }

    // Check for learned model
    const modelPath = path.resolve(process.cwd(), '.genesis/learned-model-72h.json');
    try {
      const modelStat = fs.statSync(modelPath);
      observations.push({
        timestamp: new Date(),
        category: 'learning',
        metric: 'learned_model_size_kb',
        value: Math.round(modelStat.size / 1024),
      });
    } catch (e) { console.debug('[Autopoiesis] Model check skipped:', (e as Error)?.message); }

  } catch (error) {
    observations.push({
      timestamp: new Date(),
      category: 'code',
      metric: 'observation_error',
      value: error instanceof Error ? error.message : 'unknown',
      surprise: 0.8,
    });
  }

  return observations;
}

/**
 * Observe Genesis's performance metrics
 */
export function observePerformance(): SelfObservation[] {
  const observations: SelfObservation[] = [];

  // Memory usage
  const memUsage = process.memoryUsage();
  observations.push({
    timestamp: new Date(),
    category: 'performance',
    metric: 'heap_used_mb',
    value: Math.round(memUsage.heapUsed / 1048576),
  });

  observations.push({
    timestamp: new Date(),
    category: 'performance',
    metric: 'heap_total_mb',
    value: Math.round(memUsage.heapTotal / 1048576),
  });

  const heapRatio = memUsage.heapUsed / memUsage.heapTotal;
  observations.push({
    timestamp: new Date(),
    category: 'performance',
    metric: 'heap_usage_ratio',
    value: Math.round(heapRatio * 100) / 100,
    trend: heapRatio > 0.9 ? 'degrading' : heapRatio < 0.5 ? 'improving' : 'stable',
    surprise: heapRatio > 0.95 ? 0.9 : 0,
  });

  // Uptime
  observations.push({
    timestamp: new Date(),
    category: 'performance',
    metric: 'uptime_hours',
    value: Math.round(process.uptime() / 3600 * 100) / 100,
  });

  return observations;
}

/**
 * Observe Genesis's memory systems
 */
export function observeMemory(memory: MemorySystem): SelfObservation[] {
  const observations: SelfObservation[] = [];

  observations.push({
    timestamp: new Date(),
    category: 'memory',
    metric: 'episodic_count',
    value: memory.episodic.count(),
  });

  observations.push({
    timestamp: new Date(),
    category: 'memory',
    metric: 'semantic_count',
    value: memory.semantic.count(),
  });

  observations.push({
    timestamp: new Date(),
    category: 'memory',
    metric: 'procedural_count',
    value: memory.procedural.count(),
  });

  return observations;
}

/**
 * Observe Genesis's consciousness state
 */
export function observeConsciousness(consciousness: ConsciousnessSystem): SelfObservation[] {
  const observations: SelfObservation[] = [];

  const level = consciousness.getCurrentLevel();
  const state = consciousness.getState();
  const trend = consciousness.getTrend();

  observations.push({
    timestamp: new Date(),
    category: 'consciousness',
    metric: 'phi',
    value: Math.round(level.rawPhi * 1000) / 1000,
    trend: trend === 'rising' ? 'improving' : trend === 'falling' ? 'degrading' : 'stable',
    surprise: level.rawPhi < 0.1 ? 0.9 : 0,
  });

  observations.push({
    timestamp: new Date(),
    category: 'consciousness',
    metric: 'state',
    value: state,
  });

  const invariant = consciousness.checkInvariant();
  observations.push({
    timestamp: new Date(),
    category: 'consciousness',
    metric: 'invariant_satisfied',
    value: invariant.satisfied,
    surprise: invariant.satisfied ? 0 : 0.95,
  });

  return observations;
}

// ============================================================================
// Self-Model Update
// ============================================================================

/**
 * Update the self-model in MCP memory based on observations
 */
export async function updateSelfModel(
  observations: SelfObservation[],
  mcp: IMCPClient,
): Promise<number> {
  let updatesApplied = 0;

  try {
    // Group observations by category
    const byCategory = new Map<string, SelfObservation[]>();
    for (const obs of observations) {
      const existing = byCategory.get(obs.category) || [];
      existing.push(obs);
      byCategory.set(obs.category, existing);
    }

    // Update each category as an observation on the Genesis entity
    for (const [category, obs] of byCategory) {
      const summary = obs.map(o => `${o.metric}: ${o.value}`).join(', ');
      const timestamp = new Date().toISOString();

      try {
        await mcp.call('memory' as any, 'add_observations', {
          observations: [{
            entityName: 'Genesis',
            contents: [`[${timestamp}] ${category}: ${summary}`],
          }],
        });
        updatesApplied++;
      } catch (error) {
        // MCP memory might not support this - fall back to console
        console.log(`[Autopoiesis] Self-observation: ${category} - ${summary}`);
      }
    }

    // If there are high-surprise observations, create dedicated entities
    const highSurprise = observations.filter(o => (o.surprise || 0) > 0.5);
    for (const obs of highSurprise) {
      try {
        await mcp.call('memory' as any, 'create_entities', {
          entities: [{
            name: `Anomaly-${obs.metric}-${Date.now()}`,
            entityType: 'SelfObservation',
            observations: [
              `Category: ${obs.category}`,
              `Metric: ${obs.metric}`,
              `Value: ${obs.value}`,
              `Surprise: ${obs.surprise}`,
              `Timestamp: ${obs.timestamp.toISOString()}`,
            ],
          }],
        });

        // Link anomaly to Genesis
        await mcp.call('memory' as any, 'create_relations', {
          relations: [{
            from: 'Genesis',
            to: `Anomaly-${obs.metric}-${Date.now()}`,
            relationType: 'experienced',
          }],
        });
        updatesApplied++;
      } catch (err) {
        console.error('[autopoiesis] Anomaly recording failed:', err);
      }
    }

  } catch (error) {
    console.error('[Autopoiesis] Failed to update self-model:', error);
  }

  return updatesApplied;
}

// ============================================================================
// Autopoiesis Engine
// ============================================================================

// Callback type for cycle events - enables Active Inference integration
export type AutopoiesisCycleCallback = (
  cycleNumber: number,
  observations: SelfObservation[],
  opportunities: string[],
) => void;

export class AutopoiesisEngine {
  private config: AutopoiesisConfig;
  private mcp: IMCPClient;
  private memory: MemorySystem;
  private consciousness: ConsciousnessSystem;

  private running: boolean = false;
  private intervalHandle: ReturnType<typeof setInterval> | null = null;
  private observationHistory: SelfObservation[] = [];
  private cycleCount: number = 0;

  // v13.14: Callback for Active Inference integration
  private cycleCallbacks: AutopoiesisCycleCallback[] = [];

  constructor(
    config: Partial<AutopoiesisConfig> = {},
    dependencies?: {
      mcp?: IMCPClient;
      memory?: MemorySystem;
      consciousness?: ConsciousnessSystem;
    },
  ) {
    this.config = { ...DEFAULT_AUTOPOIESIS_CONFIG, ...config };
    this.mcp = dependencies?.mcp || getMCPClient();
    this.memory = dependencies?.memory || getMemorySystem();
    this.consciousness = dependencies?.consciousness || getConsciousnessSystem();
  }

  /**
   * Start the autopoietic loop
   */
  start(): void {
    if (this.running) return;
    this.running = true;

    console.log('[Autopoiesis] Starting autopoietic loop');

    // Run immediately
    this.cycle();

    // Then run at interval
    this.intervalHandle = setInterval(
      () => {
        try {
          this.cycle();
        } catch (err) {
          console.error('[autopoiesis] Timer error:', err);
        }
      },
      this.config.observationIntervalMs,
    );
  }

  /**
   * Stop the autopoietic loop
   */
  stop(): void {
    if (!this.running) return;
    this.running = false;

    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }

    console.log('[Autopoiesis] Stopped autopoietic loop');
  }

  /**
   * v13.14: Register a callback to be called after each autopoietic cycle.
   * This enables closing the loop with Active Inference.
   */
  onCycle(callback: AutopoiesisCycleCallback): void {
    this.cycleCallbacks.push(callback);
  }

  /**
   * Run one autopoietic cycle
   */
  async cycle(): Promise<void> {
    this.cycleCount++;
    const cycleStart = Date.now();

    try {
      // 1. OBSERVE SELF
      const observations: SelfObservation[] = [
        ...(await observeCode()),
        ...observePerformance(),
        ...observeMemory(this.memory),
        ...observeConsciousness(this.consciousness),
      ];

      this.observationHistory.push(...observations);

      // Keep history bounded
      if (this.observationHistory.length > 1000) {
        this.observationHistory = this.observationHistory.slice(-500);
      }

      // 2. UPDATE SELF-MODEL (in MCP memory)
      if (this.config.mcpMemoryEnabled) {
        const updates = await updateSelfModel(observations, this.mcp);
        if (updates > 0) {
          console.log(`[Autopoiesis] Cycle ${this.cycleCount}: ${observations.length} observations, ${updates} model updates`);
        }
      }

      // 3. DETECT SELF-IMPROVEMENT OPPORTUNITIES
      const opportunities = this.detectImprovementOpportunities(observations);

      // 4. Record opportunities for Active Inference to act on
      if (opportunities.length > 0 && this.config.learningEnabled) {
        for (const opp of opportunities) {
          this.memory.remember({
            what: `Self-improvement opportunity: ${opp}`,
            when: new Date(),
            importance: 0.7,
            tags: ['autopoiesis', 'self-improvement', 'opportunity'],
          });
        }
      }

      // 5. Log high-surprise events
      const surprises = observations.filter(o => (o.surprise || 0) > 0.5);
      for (const s of surprises) {
        console.log(`[Autopoiesis] HIGH SURPRISE: ${s.category}.${s.metric} = ${s.value} (surprise: ${s.surprise})`);
      }

      // 6. CLOSE THE LOOP: Notify Active Inference via callbacks
      // This is the critical integration point - self-observations feed back into AI decision-making
      for (const callback of this.cycleCallbacks) {
        try {
          callback(this.cycleCount, observations, opportunities);
        } catch (callbackError) {
          console.error('[Autopoiesis] Callback error:', callbackError);
        }
      }

    } catch (error) {
      console.error('[Autopoiesis] Cycle error:', error);
    }
  }

  /**
   * Detect opportunities for self-improvement based on observations
   */
  private detectImprovementOpportunities(observations: SelfObservation[]): string[] {
    const opportunities: string[] = [];

    for (const obs of observations) {
      // High memory pressure
      if (obs.metric === 'heap_usage_ratio' && typeof obs.value === 'number' && obs.value > 0.85) {
        opportunities.push('Optimize memory usage - heap pressure high');
      }

      // Consciousness degradation
      if (obs.metric === 'phi' && typeof obs.value === 'number' && obs.value < 0.2) {
        opportunities.push('Improve consciousness integration - φ low');
      }

      // Learning model not growing
      if (obs.metric === 'learned_model_size_kb' && typeof obs.value === 'number' && obs.value < 50) {
        opportunities.push('Increase learning rate - model too small');
      }

      // Memory imbalance
      if (obs.metric === 'semantic_count' && typeof obs.value === 'number') {
        const episodic = observations.find(o => o.metric === 'episodic_count');
        if (episodic && typeof episodic.value === 'number') {
          if (episodic.value > obs.value * 10) {
            opportunities.push('Run memory consolidation - too many unconsolidated episodes');
          }
        }
      }
    }

    return opportunities;
  }

  /**
   * Get autopoiesis statistics
   */
  stats(): {
    running: boolean;
    cycleCount: number;
    observationCount: number;
    lastObservations: SelfObservation[];
  } {
    return {
      running: this.running,
      cycleCount: this.cycleCount,
      observationCount: this.observationHistory.length,
      lastObservations: this.observationHistory.slice(-10),
    };
  }
}

// ============================================================================
// Factory & Singleton
// ============================================================================

let autopoiesisInstance: AutopoiesisEngine | null = null;

export function createAutopoiesisEngine(
  config?: Partial<AutopoiesisConfig>,
): AutopoiesisEngine {
  return new AutopoiesisEngine(config);
}

export function getAutopoiesisEngine(
  config?: Partial<AutopoiesisConfig>,
): AutopoiesisEngine {
  if (!autopoiesisInstance) {
    autopoiesisInstance = createAutopoiesisEngine(config);
  }
  return autopoiesisInstance;
}

export function resetAutopoiesisEngine(): void {
  if (autopoiesisInstance) {
    autopoiesisInstance.stop();
    autopoiesisInstance = null;
  }
}
