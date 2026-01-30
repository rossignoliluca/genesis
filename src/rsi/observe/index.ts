/**
 * Genesis RSI - OBSERVE Subsystem
 *
 * Detects limitations and opportunities through:
 * - Performance monitoring (heap, latency, error rate)
 * - Static code analysis (quality, complexity)
 * - Phi tracking (consciousness health)
 * - Capability detection (missing features)
 * - Autopoiesis integration (self-observations)
 *
 * @module rsi/observe
 */

import { randomUUID } from 'crypto';
import {
  Limitation, Opportunity, Evidence, LimitationType, ResearchSource
} from '../types.js';
import { getAutopoiesisEngine } from '../../autopoiesis/index.js';
import { getObservationGatherer } from '../../active-inference/observations.js';

// =============================================================================
// PERFORMANCE METRICS
// =============================================================================

export interface PerformanceMetrics {
  heapUsageRatio: number;
  avgResponseTime: number;
  errorRate: number;
  phiLevel: number;
  freeEnergy: number;
  memoryReuse: number;
  uptimeHours: number;
}

// =============================================================================
// PERFORMANCE MONITOR
// =============================================================================

export class PerformanceMonitor {
  private metrics: PerformanceMetrics[] = [];
  private thresholds = {
    heapUsageRatio: 0.9,      // Above 90% = problem
    avgResponseTime: 5000,    // 5 seconds
    errorRate: 0.1,           // 10%
    phiLevel: 0.2,            // Minimum phi
    memoryReuse: 0.3,         // 30%
  };

  /**
   * Get current metrics from autopoiesis state
   */
  getCurrentMetrics(): PerformanceMetrics {
    const gatherer = getObservationGatherer();
    const autoState = gatherer.getAutopoiesisState();

    if (autoState) {
      return {
        heapUsageRatio: autoState.heapUsageRatio,
        avgResponseTime: 0, // Not tracked yet
        errorRate: 0,
        phiLevel: autoState.phi,
        freeEnergy: 5, // Default
        memoryReuse: 0.5,
        uptimeHours: autoState.uptimeHours,
      };
    }

    // Fallback to process metrics
    const mem = process.memoryUsage();
    return {
      heapUsageRatio: mem.heapUsed / mem.heapTotal,
      avgResponseTime: 0,
      errorRate: 0,
      phiLevel: 0.5,
      freeEnergy: 5,
      memoryReuse: 0.5,
      uptimeHours: process.uptime() / 3600,
    };
  }

  /**
   * Record current metrics
   */
  recordMetrics(): void {
    this.metrics.push(this.getCurrentMetrics());
    if (this.metrics.length > 1000) {
      this.metrics.shift();
    }
  }

  /**
   * Detect performance-related limitations
   */
  detectLimitations(): Limitation[] {
    const limitations: Limitation[] = [];
    const current = this.getCurrentMetrics();
    const recent = this.metrics.slice(-100);

    // High heap usage
    if (current.heapUsageRatio > this.thresholds.heapUsageRatio) {
      limitations.push({
        id: randomUUID(),
        type: 'performance',
        severity: current.heapUsageRatio > 0.95 ? 'critical' : 'high',
        description: `Heap usage ${(current.heapUsageRatio * 100).toFixed(1)}% exceeds threshold`,
        evidence: [{
          source: 'metrics',
          data: { heapUsageRatio: current.heapUsageRatio },
          timestamp: new Date(),
        }],
        affectedComponents: ['kernel', 'memory'],
        detectedAt: new Date(),
        confidence: 0.95,
        estimatedImpact: current.heapUsageRatio,
      });
    }

    // Low phi
    if (current.phiLevel < this.thresholds.phiLevel) {
      limitations.push({
        id: randomUUID(),
        type: 'capability',
        severity: current.phiLevel < 0.1 ? 'critical' : 'high',
        description: `Consciousness (phi) ${current.phiLevel.toFixed(3)} below threshold`,
        evidence: [{
          source: 'metrics',
          data: { phi: current.phiLevel },
          timestamp: new Date(),
        }],
        affectedComponents: ['consciousness', 'phi-monitor'],
        detectedAt: new Date(),
        confidence: 0.9,
        estimatedImpact: 0.8,
      });
    }

    // High error rate (if we have history)
    if (recent.length >= 10) {
      const avgErrorRate = recent.reduce((s, m) => s + m.errorRate, 0) / recent.length;
      if (avgErrorRate > this.thresholds.errorRate) {
        limitations.push({
          id: randomUUID(),
          type: 'reliability',
          severity: avgErrorRate > 0.2 ? 'critical' : 'high',
          description: `Error rate ${(avgErrorRate * 100).toFixed(1)}% exceeds threshold`,
          evidence: [{
            source: 'metrics',
            data: { errorRate: avgErrorRate },
            timestamp: new Date(),
          }],
          affectedComponents: ['kernel', 'healing'],
          detectedAt: new Date(),
          confidence: 0.85,
          estimatedImpact: avgErrorRate,
        });
      }
    }

    return limitations;
  }
}

// =============================================================================
// CODE ANALYZER
// =============================================================================

export class CodeAnalyzer {
  /**
   * Analyze code quality for limitations
   * Uses simple heuristics - could be enhanced with AST analysis
   */
  async analyzeLimitations(): Promise<Limitation[]> {
    const limitations: Limitation[] = [];

    // Check for common code quality issues
    // This is simplified - a full implementation would use AST parsing
    try {
      const fs = await import('fs');
      const path = await import('path');
      const srcDir = path.resolve(process.cwd(), 'src');

      // Count files with TODO/FIXME
      let todoCount = 0;
      let totalFiles = 0;

      const countTodos = (dir: string): void => {
        try {
          const items = fs.readdirSync(dir);
          for (const item of items) {
            const fullPath = path.join(dir, item);
            const stat = fs.statSync(fullPath);
            if (stat.isDirectory() && !item.startsWith('.') && item !== 'node_modules') {
              countTodos(fullPath);
            } else if (item.endsWith('.ts')) {
              totalFiles++;
              const content = fs.readFileSync(fullPath, 'utf-8');
              const matches = content.match(/TODO|FIXME|HACK|XXX/gi);
              if (matches) {
                todoCount += matches.length;
              }
            }
          }
        } catch { /* ignore */ }
      };

      countTodos(srcDir);

      if (todoCount > 50) {
        limitations.push({
          id: randomUUID(),
          type: 'quality',
          severity: todoCount > 100 ? 'medium' : 'low',
          description: `${todoCount} TODO/FIXME comments across ${totalFiles} files indicate incomplete work`,
          evidence: [{
            source: 'static-analysis',
            data: { todoCount, totalFiles },
            timestamp: new Date(),
          }],
          affectedComponents: ['codebase'],
          detectedAt: new Date(),
          confidence: 0.7,
          estimatedImpact: 0.3,
        });
      }
    } catch (error) {
      // Code analysis failed - not critical
    }

    return limitations;
  }
}

// =============================================================================
// CAPABILITY DETECTOR
// =============================================================================

export class CapabilityDetector {
  private knownCapabilities = new Set([
    'web-search', 'code-generation', 'memory-storage', 'memory-retrieval',
    'active-inference', 'phi-monitoring', 'self-modification', 'git-operations',
    'paper-search', 'file-operations', 'reasoning', 'autopoiesis',
  ]);

  private desiredCapabilities = new Set([
    'autonomous-code-generation',  // Generate complex code, not just templates
    'formal-verification',          // Prove correctness of modifications
    'multi-agent-coordination',     // Coordinate with other AI systems
    'continuous-learning',          // Learn without restart
    'image-understanding',          // Process visual information
  ]);

  /**
   * Detect missing capabilities as limitations
   */
  detectLimitations(): Limitation[] {
    const limitations: Limitation[] = [];
    const missing = [...this.desiredCapabilities].filter(c => !this.knownCapabilities.has(c));

    for (const capability of missing) {
      limitations.push({
        id: randomUUID(),
        type: 'capability',
        severity: 'medium',
        description: `Missing capability: ${capability}`,
        evidence: [{
          source: 'self-observation',
          data: { capability, known: [...this.knownCapabilities] },
          timestamp: new Date(),
        }],
        affectedComponents: ['agents', 'tools'],
        detectedAt: new Date(),
        confidence: 0.9,
        estimatedImpact: 0.4,
      });
    }

    return limitations;
  }

  /**
   * Register a new capability
   */
  registerCapability(capability: string): void {
    this.knownCapabilities.add(capability);
  }
}

// =============================================================================
// OPPORTUNITY FINDER
// =============================================================================

export class OpportunityFinder {
  /**
   * Find improvement opportunities from autopoiesis observations
   */
  findFromAutopoiesis(): Opportunity[] {
    const opportunities: Opportunity[] = [];
    const autopoiesis = getAutopoiesisEngine();
    const stats = autopoiesis.stats();

    // Check for improvement opportunities detected by autopoiesis
    const recentObs = stats.lastObservations;
    for (const obs of recentObs) {
      // High-surprise observations indicate learning opportunities
      if (obs.surprise && obs.surprise > 0.5) {
        opportunities.push({
          id: randomUUID(),
          type: 'optimization',
          description: `High-surprise observation in ${obs.category}: ${obs.metric} = ${obs.value}`,
          expectedBenefit: obs.surprise,
          estimatedEffort: 0.5,
          priority: obs.surprise / 0.5,
          source: {
            type: 'memory',
            title: 'Autopoiesis Self-Observation',
            summary: `${obs.category}.${obs.metric} showed unexpected value`,
            relevanceScore: obs.surprise,
            retrievedAt: new Date(),
          },
          discoveredAt: new Date(),
        });
      }
    }

    return opportunities;
  }
}

// =============================================================================
// OBSERVATION ENGINE
// =============================================================================

export class ObservationEngine {
  private performanceMonitor: PerformanceMonitor;
  private codeAnalyzer: CodeAnalyzer;
  private capabilityDetector: CapabilityDetector;
  private opportunityFinder: OpportunityFinder;

  constructor() {
    this.performanceMonitor = new PerformanceMonitor();
    this.codeAnalyzer = new CodeAnalyzer();
    this.capabilityDetector = new CapabilityDetector();
    this.opportunityFinder = new OpportunityFinder();
  }

  /**
   * Record current metrics
   */
  recordMetrics(): void {
    this.performanceMonitor.recordMetrics();
  }

  /**
   * Detect all limitations
   */
  async detectLimitations(): Promise<Limitation[]> {
    const all: Limitation[] = [];

    // Performance limitations
    all.push(...this.performanceMonitor.detectLimitations());

    // Code quality limitations
    all.push(...await this.codeAnalyzer.analyzeLimitations());

    // Missing capabilities
    all.push(...this.capabilityDetector.detectLimitations());

    // Sort by impact * confidence
    all.sort((a, b) => (b.estimatedImpact * b.confidence) - (a.estimatedImpact * a.confidence));

    return all;
  }

  /**
   * Detect improvement opportunities
   */
  async detectOpportunities(): Promise<Opportunity[]> {
    const all: Opportunity[] = [];

    // From autopoiesis observations
    all.push(...this.opportunityFinder.findFromAutopoiesis());

    // Sort by priority
    all.sort((a, b) => b.priority - a.priority);

    return all;
  }

  /**
   * Get current performance metrics
   */
  getCurrentMetrics(): PerformanceMetrics {
    return this.performanceMonitor.getCurrentMetrics();
  }
}

// =============================================================================
// SINGLETON
// =============================================================================

let observationEngineInstance: ObservationEngine | null = null;

export function getObservationEngine(): ObservationEngine {
  if (!observationEngineInstance) {
    observationEngineInstance = new ObservationEngine();
  }
  return observationEngineInstance;
}

export function resetObservationEngine(): void {
  observationEngineInstance = null;
}
