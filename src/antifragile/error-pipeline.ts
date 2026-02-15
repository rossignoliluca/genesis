/**
 * Error Training Pipeline — Capture, Classify, Learn
 *
 * Subscribes to error events across Genesis, classifies them,
 * extracts patterns, and stores them for predictive avoidance.
 */

import { createSubscriber, getEventBus } from '../bus/index.js';
import { getMemorySystem } from '../memory/index.js';
import { createHash } from 'crypto';
import {
  AntifragileConfig,
  DEFAULT_ANTIFRAGILE_CONFIG,
  FailureRecord,
  FailureClassification,
  FailurePattern,
} from './types.js';

export class ErrorTrainingPipeline {
  private failures: FailureRecord[] = [];
  private patterns = new Map<string, FailurePattern>();

  constructor(private config: AntifragileConfig = DEFAULT_ANTIFRAGILE_CONFIG) {}

  /** Start listening to all error sources on the bus */
  start(): void {
    const sub = createSubscriber('antifragile-pipeline');

    // Subscribe to all error-producing topics
    sub.on('kernel.task.failed', (e) => {
      this.capture('kernel', 'task_failure', e.error, 0.6, { taskId: e.taskId });
    });

    sub.on('kernel.panic', (e) => {
      this.capture('kernel', 'panic', e.reason, e.severity === 'fatal' ? 1.0 : 0.7, {
        severity: e.severity, recoverable: e.recoverable,
      });
    });

    sub.on('worldmodel.consistency.violation', (e) => {
      this.capture('world-model', 'consistency_violation', String(e.source || ''), 0.5, {});
    });

    sub.on('consciousness.phi.violated', (e) => {
      this.capture('consciousness', 'phi_violation', e.invariant, 0.8, {
        expected: e.expected, actual: e.actual,
      });
    });

    sub.on('semiotics.hallucination.detected', (e) => {
      this.capture('semiotics', 'hallucination', e.source, 0.7, {});
    });

    sub.on('morphogenetic.error.detected', (e) => {
      this.capture('morphogenetic', 'structural_error', e.source, 0.5, {});
    });

    sub.on('pain.stimulus', (e) => {
      if (e.intensity > 0.5) {
        this.capture('nociception', 'high_pain', e.location, e.intensity, {
          type: e.type,
        });
      }
    });
  }

  /** Capture a failure and run through the pipeline */
  capture(
    domain: string,
    errorType: string,
    message: string,
    severity: number,
    context: Record<string, unknown>,
  ): void {
    if (severity < this.config.captureThreshold) return;

    const patternHash = this.hashPattern(domain, errorType, message);

    const record: FailureRecord = {
      id: `fail-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      domain,
      errorType,
      message,
      severity,
      timestamp: new Date().toISOString(),
      context,
      patternHash,
    };

    // Classify
    record.classification = this.classify(record);

    // Store
    this.failures.push(record);
    if (this.failures.length > 1000) this.failures.shift();

    // Emit
    const bus = getEventBus();
    bus.publish('antifragile.failure.captured', {
      source: 'antifragile-pipeline',
      precision: 0.8,
      domain,
      errorType,
      severity,
      patternHash,
      classification: record.classification,
    });

    // Update or create pattern
    this.updatePattern(record);
  }

  /** Get all learned patterns */
  getPatterns(): FailurePattern[] {
    return Array.from(this.patterns.values());
  }

  /** Get patterns for a specific domain */
  getPatternsByDomain(domain: string): FailurePattern[] {
    return Array.from(this.patterns.values()).filter(p => p.domain === domain);
  }

  /** Get failure history */
  getFailures(limit = 50): FailureRecord[] {
    return this.failures.slice(-limit);
  }

  private classify(record: FailureRecord): FailureClassification {
    const existing = this.patterns.get(record.patternHash);

    if (!existing) {
      return { type: 'novel', recurrence: 1 };
    }

    const recurrence = existing.occurrences + 1;

    if (recurrence >= 5) {
      return { type: 'systematic', recurrence };
    }

    if (recurrence >= 2) {
      return { type: 'recurring', recurrence };
    }

    return { type: 'transient', recurrence };
  }

  private updatePattern(record: FailureRecord): void {
    const existing = this.patterns.get(record.patternHash);

    if (existing) {
      existing.occurrences++;
      existing.avgSeverity = (existing.avgSeverity * (existing.occurrences - 1) + record.severity) / existing.occurrences;
      existing.lastSeen = record.timestamp;
    } else {
      const pattern: FailurePattern = {
        id: `pat-${record.patternHash.slice(0, 12)}`,
        domain: record.domain,
        patternHash: record.patternHash,
        description: `${record.domain}:${record.errorType} — ${record.message.slice(0, 100)}`,
        occurrences: 1,
        avgSeverity: record.severity,
        firstSeen: record.timestamp,
        lastSeen: record.timestamp,
      };

      this.patterns.set(record.patternHash, pattern);

      // Publish pattern learned event
      const bus = getEventBus();
      bus.publish('antifragile.pattern.learned', {
        source: 'antifragile-pipeline',
        precision: 0.7,
        patternId: pattern.id,
        domain: record.domain,
        type: 'learned',
        description: pattern.description,
        sampleCount: 1,
      });

      // Store in semantic memory
      const memory = getMemorySystem();
      memory.learn({
        concept: `failure-pattern:${pattern.id}`,
        definition: pattern.description,
        category: 'antifragile-patterns',
      });
    }

    // Enforce max patterns per domain
    const domainPatterns = Array.from(this.patterns.values())
      .filter(p => p.domain === record.domain);
    if (domainPatterns.length > this.config.maxPatternsPerDomain) {
      // Remove least-recent pattern
      const oldest = domainPatterns.sort((a, b) =>
        new Date(a.lastSeen).getTime() - new Date(b.lastSeen).getTime()
      )[0];
      this.patterns.delete(oldest.patternHash);
    }
  }

  private hashPattern(domain: string, errorType: string, message: string): string {
    // Normalize message (remove timestamps, IDs, numbers)
    const normalized = message.replace(/\d+/g, 'N').replace(/[a-f0-9]{8,}/gi, 'H').trim();
    return createHash('sha256')
      .update(`${domain}:${errorType}:${normalized}`)
      .digest('hex')
      .slice(0, 16);
  }
}
