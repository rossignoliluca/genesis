/**
 * Predictive Avoidance Engine
 *
 * Maintains failure attractors in a feature space.
 * Before actions are taken, checks if the planned action
 * would land near a known failure attractor.
 */

import { getEventBus } from '../bus/index.js';
import { getMemorySystem } from '../memory/index.js';
import {
  AntifragileConfig,
  DEFAULT_ANTIFRAGILE_CONFIG,
  FailureAttractor,
  ActionCheckResult,
} from './types.js';

export class PredictiveAvoidanceEngine {
  private attractors = new Map<string, FailureAttractor[]>();

  constructor(private config: AntifragileConfig = DEFAULT_ANTIFRAGILE_CONFIG) {}

  /** Start listening for failure events to build attractors */
  start(): void {
    const bus = getEventBus();
    bus.subscribe('antifragile.failure.captured', (event: any) => {
      this.ingestFailure(
        event.domain,
        event.severity,
        `${event.domain}:${event.errorType}`,
      );
    });
  }

  /**
   * Check if a planned action is safe given known failure attractors.
   * Call this BEFORE executing any significant action.
   */
  checkAction(
    domain: string,
    actionDescription: string,
    context: Record<string, unknown> = {},
  ): ActionCheckResult {
    const domainAttractors = this.attractors.get(domain) || [];
    if (domainAttractors.length === 0) {
      return { safe: true, riskScore: 0 };
    }

    // Simple keyword-based similarity (in production: use embeddings)
    const actionFeatures = this.extractFeatures(actionDescription, context);

    let nearestDistance = Infinity;
    let nearestAttractor: FailureAttractor | null = null;

    for (const attractor of domainAttractors) {
      const distance = this.computeDistance(actionFeatures, attractor);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestAttractor = attractor;
      }
    }

    if (!nearestAttractor || nearestDistance > attractor_radius(nearestAttractor)) {
      return { safe: true, riskScore: Math.max(0, 1 - nearestDistance) };
    }

    // Near a failure attractor — warn or block
    const riskScore = Math.min(1, nearestAttractor.avgSeverity * (1 - nearestDistance / nearestAttractor.radius));

    // Emit pattern triggered event
    const bus = getEventBus();
    bus.publish('antifragile.pattern.triggered', {
      source: 'predictive-avoidance',
      precision: 0.7,
      patternId: nearestAttractor.id,
      domain,
      type: 'triggered',
      description: `Action "${actionDescription}" near failure attractor: ${nearestAttractor.description}`,
      sampleCount: nearestAttractor.sampleCount,
    });

    return {
      safe: riskScore < 0.5,
      riskScore,
      nearestAttractor: {
        id: nearestAttractor.id,
        distance: nearestDistance,
        description: nearestAttractor.description,
      },
      modifications: nearestAttractor.evasion.actionModification ? {
        actionModification: nearestAttractor.evasion.actionModification,
        confidenceMultiplier: nearestAttractor.evasion.confidenceMultiplier,
      } : undefined,
    };
  }

  /** Ingest a failure and update/create attractors */
  ingestFailure(domain: string, severity: number, description: string): void {
    if (!this.attractors.has(domain)) {
      this.attractors.set(domain, []);
    }

    const domainAttractors = this.attractors.get(domain)!;

    // Try to merge into existing attractor by description similarity
    for (const attractor of domainAttractors) {
      if (this.descriptionSimilarity(description, attractor.description) > this.config.similarityThreshold) {
        attractor.sampleCount++;
        attractor.avgSeverity = (attractor.avgSeverity * (attractor.sampleCount - 1) + severity) / attractor.sampleCount;
        attractor.lastUpdated = new Date().toISOString();
        return;
      }
    }

    // Create new attractor
    const id = `fa-${domain}-${Date.now()}`;
    domainAttractors.push({
      id,
      domain,
      description,
      sampleCount: 1,
      avgSeverity: severity,
      radius: 0.5,
      lastUpdated: new Date().toISOString(),
      evasion: {
        actionModification: `Avoid actions similar to: ${description}`,
        confidenceMultiplier: 0.5,
        alternatives: [],
      },
    });

    // Persist in memory
    const memory = getMemorySystem();
    memory.learn({
      concept: `failure-attractor:${id}`,
      definition: description,
      category: 'antifragile-attractors',
    });
  }

  /** Get all attractors for a domain */
  getAttractors(domain?: string): FailureAttractor[] {
    if (domain) return this.attractors.get(domain) || [];
    const all: FailureAttractor[] = [];
    for (const arr of this.attractors.values()) all.push(...arr);
    return all;
  }

  private extractFeatures(
    description: string,
    context: Record<string, unknown>,
  ): string[] {
    const words = description.toLowerCase().split(/\W+/).filter(w => w.length > 2);
    const contextWords = Object.values(context)
      .map(v => String(v).toLowerCase())
      .flatMap(s => s.split(/\W+/))
      .filter(w => w.length > 2);
    return [...new Set([...words, ...contextWords])];
  }

  private computeDistance(features: string[], attractor: FailureAttractor): number {
    const attractorWords = attractor.description.toLowerCase().split(/\W+/).filter(w => w.length > 2);
    if (attractorWords.length === 0) return 1;

    const overlap = features.filter(f => attractorWords.includes(f)).length;
    const similarity = overlap / Math.max(features.length, attractorWords.length);
    return 1 - similarity;
  }

  private descriptionSimilarity(a: string, b: string): number {
    const wordsA = new Set(a.toLowerCase().split(/\W+/).filter(w => w.length > 2));
    const wordsB = new Set(b.toLowerCase().split(/\W+/).filter(w => w.length > 2));
    if (wordsA.size === 0 || wordsB.size === 0) return 0;

    let overlap = 0;
    for (const w of wordsA) if (wordsB.has(w)) overlap++;
    return overlap / Math.max(wordsA.size, wordsB.size);
  }
}

function attractor_radius(a: FailureAttractor): number {
  return a.radius;
}
