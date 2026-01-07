/**
 * Genesis 4.0 - Predictor Agent
 *
 * Forecasts outcomes based on patterns, history, and models.
 * The oracle: "Based on patterns, I predict..."
 *
 * Features:
 * - Pattern-based prediction
 * - Confidence estimation
 * - Historical pattern matching
 * - Monte Carlo simulation (simple)
 * - Learning from outcomes
 */

import { BaseAgent, registerAgentFactory } from './base-agent.js';
import { MessageBus, messageBus } from './message-bus.js';
import {
  Message,
  MessageType,
} from './types.js';
import { randomUUID } from 'crypto';

// ============================================================================
// Types
// ============================================================================

interface Prediction {
  id: string;
  query: string;
  outcomes: PredictedOutcome[];
  confidence: number;
  reasoning: string;
  timestamp: Date;
  horizon: string; // e.g., "short_term", "medium_term", "long_term"
  verified?: boolean;
  actualOutcome?: string;
}

interface PredictedOutcome {
  description: string;
  probability: number;
  impact: 'positive' | 'negative' | 'neutral';
  timeframe?: string;
}

interface Pattern {
  id: string;
  conditions: string[];
  outcome: string;
  occurrences: number;
  successRate: number;
  lastSeen: Date;
}

interface HistoricalEvent {
  query: string;
  outcome: string;
  timestamp: Date;
  context?: Record<string, any>;
}

// ============================================================================
// Predictor Agent
// ============================================================================

export class PredictorAgent extends BaseAgent {
  // Pattern library learned from experience
  private patterns: Map<string, Pattern> = new Map();

  // Prediction history
  private predictions: Map<string, Prediction> = new Map();

  // Historical events for pattern matching
  private history: HistoricalEvent[] = [];

  // Baseline probabilities for common outcomes
  private baselines: Record<string, number> = {
    success: 0.6,
    failure: 0.25,
    partial: 0.1,
    unknown: 0.05,
  };

  constructor(bus: MessageBus = messageBus) {
    super({ type: 'predictor' }, bus);
    this.initializePatterns();
  }

  private initializePatterns(): void {
    // Pre-load common patterns
    this.patterns.set('build-after-research', {
      id: 'build-after-research',
      conditions: ['research_complete', 'plan_created'],
      outcome: 'build_success',
      occurrences: 100,
      successRate: 0.85,
      lastSeen: new Date(),
    });

    this.patterns.set('iterate-after-critique', {
      id: 'iterate-after-critique',
      conditions: ['critique_received', 'low_score'],
      outcome: 'improvement',
      occurrences: 80,
      successRate: 0.7,
      lastSeen: new Date(),
    });

    this.patterns.set('failure-without-ethics', {
      id: 'failure-without-ethics',
      conditions: ['ethics_skipped', 'risky_action'],
      outcome: 'negative_consequence',
      occurrences: 50,
      successRate: 0.4,
      lastSeen: new Date(),
    });

    this.patterns.set('success-with-planning', {
      id: 'success-with-planning',
      conditions: ['plan_created', 'steps_followed'],
      outcome: 'goal_achieved',
      occurrences: 120,
      successRate: 0.82,
      lastSeen: new Date(),
    });
  }

  // ============================================================================
  // Message Handling
  // ============================================================================

  protected getMessageTypes(): MessageType[] {
    return ['PREDICT', 'FEEDBACK', 'QUERY', 'COMMAND'];
  }

  async process(message: Message): Promise<Message | null> {
    switch (message.type) {
      case 'PREDICT':
        return this.handlePredictRequest(message);
      case 'FEEDBACK':
        return this.handleFeedback(message);
      case 'QUERY':
        return this.handleQuery(message);
      case 'COMMAND':
        return this.handleCommand(message);
      default:
        return null;
    }
  }

  // ============================================================================
  // Prediction Logic
  // ============================================================================

  private async handlePredictRequest(message: Message): Promise<Message | null> {
    const { query, context, conditions, horizon } = message.payload;

    const prediction = this.predict(query, {
      context,
      conditions,
      horizon: horizon || 'short_term',
    });

    this.predictions.set(prediction.id, prediction);

    this.log(`Prediction: "${query}" -> ${prediction.outcomes[0]?.description} (${(prediction.confidence * 100).toFixed(0)}% confidence)`);

    return {
      ...this.createResponse(message, 'RESPONSE', { prediction }),
      id: '',
      timestamp: new Date(),
    };
  }

  predict(
    query: string,
    options: {
      context?: Record<string, any>;
      conditions?: string[];
      horizon?: string;
    } = {}
  ): Prediction {
    const { context, conditions = [], horizon = 'short_term' } = options;

    // 1. Find matching patterns
    const matchingPatterns = this.findMatchingPatterns(query, conditions);

    // 2. Calculate outcomes based on patterns + baselines
    const outcomes = this.calculateOutcomes(query, matchingPatterns, context);

    // 3. Calculate overall confidence
    const confidence = this.calculateConfidence(matchingPatterns, outcomes);

    // 4. Generate reasoning
    const reasoning = this.generateReasoning(matchingPatterns, outcomes);

    const prediction: Prediction = {
      id: randomUUID(),
      query,
      outcomes,
      confidence,
      reasoning,
      timestamp: new Date(),
      horizon,
    };

    return prediction;
  }

  // ============================================================================
  // Pattern Matching
  // ============================================================================

  private findMatchingPatterns(query: string, conditions: string[]): Pattern[] {
    const queryLower = query.toLowerCase();
    const matching: Pattern[] = [];

    for (const pattern of this.patterns.values()) {
      // Check if any conditions match
      const conditionMatch = pattern.conditions.some((c) =>
        conditions.some((cond) => cond.toLowerCase().includes(c)) ||
        queryLower.includes(c.replace(/_/g, ' '))
      );

      // Check if query relates to outcome
      const outcomeMatch = queryLower.includes(pattern.outcome.replace(/_/g, ' '));

      if (conditionMatch || outcomeMatch) {
        matching.push(pattern);
      }
    }

    // Also check history for similar queries
    const historicalMatches = this.findHistoricalMatches(query);
    for (const match of historicalMatches) {
      // Create temporary pattern from historical match
      matching.push({
        id: 'historical-' + randomUUID().slice(0, 4),
        conditions: [match.query],
        outcome: match.outcome,
        occurrences: 1,
        successRate: 0.7, // Historical matches get moderate confidence
        lastSeen: match.timestamp,
      });
    }

    return matching;
  }

  private findHistoricalMatches(query: string): HistoricalEvent[] {
    const queryWords = new Set(query.toLowerCase().split(/\s+/));

    return this.history.filter((event) => {
      const eventWords = new Set(event.query.toLowerCase().split(/\s+/));
      const overlap = [...queryWords].filter((w) => eventWords.has(w));
      return overlap.length >= 2; // At least 2 words in common
    }).slice(-5); // Last 5 matches
  }

  // ============================================================================
  // Outcome Calculation
  // ============================================================================

  private calculateOutcomes(
    query: string,
    patterns: Pattern[],
    context?: Record<string, any>
  ): PredictedOutcome[] {
    const outcomes: Map<string, PredictedOutcome> = new Map();
    const queryLower = query.toLowerCase();

    // Start with pattern-based outcomes
    for (const pattern of patterns) {
      const existing = outcomes.get(pattern.outcome);
      const probability = pattern.successRate * (pattern.occurrences / (pattern.occurrences + 10));

      if (existing) {
        existing.probability = Math.min(0.95, existing.probability + probability * 0.5);
      } else {
        outcomes.set(pattern.outcome, {
          description: this.humanizeOutcome(pattern.outcome),
          probability,
          impact: this.determineImpact(pattern.outcome),
          timeframe: this.estimateTimeframe(pattern.outcome),
        });
      }
    }

    // Add baseline outcomes if no patterns found
    if (outcomes.size === 0) {
      // Try to infer from query keywords
      if (queryLower.includes('success') || queryLower.includes('work')) {
        outcomes.set('success', {
          description: 'The operation will succeed',
          probability: this.baselines.success,
          impact: 'positive',
        });
        outcomes.set('failure', {
          description: 'The operation may fail',
          probability: this.baselines.failure,
          impact: 'negative',
        });
      } else if (queryLower.includes('fail') || queryLower.includes('error')) {
        outcomes.set('failure', {
          description: 'Issues are likely to occur',
          probability: 0.6,
          impact: 'negative',
        });
        outcomes.set('recovery', {
          description: 'Recovery is possible with intervention',
          probability: 0.3,
          impact: 'neutral',
        });
      } else {
        // Generic uncertain prediction
        outcomes.set('uncertain', {
          description: 'Outcome is uncertain, multiple possibilities exist',
          probability: 0.5,
          impact: 'neutral',
        });
      }
    }

    // Sort by probability
    return Array.from(outcomes.values()).sort((a, b) => b.probability - a.probability);
  }

  private humanizeOutcome(outcome: string): string {
    const humanizations: Record<string, string> = {
      build_success: 'The build will complete successfully',
      improvement: 'Quality will improve after iteration',
      negative_consequence: 'Negative consequences may occur',
      goal_achieved: 'The goal will be achieved',
      success: 'The operation will succeed',
      failure: 'The operation may fail',
      partial: 'Partial success is likely',
    };

    return humanizations[outcome] || outcome.replace(/_/g, ' ');
  }

  private determineImpact(outcome: string): 'positive' | 'negative' | 'neutral' {
    const positives = ['success', 'improvement', 'achieved', 'complete'];
    const negatives = ['fail', 'error', 'negative', 'problem'];

    const outcomeLower = outcome.toLowerCase();

    if (positives.some((p) => outcomeLower.includes(p))) return 'positive';
    if (negatives.some((n) => outcomeLower.includes(n))) return 'negative';
    return 'neutral';
  }

  private estimateTimeframe(outcome: string): string {
    // Simple heuristic based on outcome type
    if (outcome.includes('immediate') || outcome.includes('quick')) {
      return 'immediate';
    }
    if (outcome.includes('long') || outcome.includes('eventual')) {
      return 'long_term';
    }
    return 'short_term';
  }

  // ============================================================================
  // Confidence Calculation
  // ============================================================================

  private calculateConfidence(patterns: Pattern[], outcomes: PredictedOutcome[]): number {
    let confidence = 0.3; // Base confidence

    // More patterns = more confidence
    confidence += Math.min(0.3, patterns.length * 0.1);

    // Patterns with more occurrences = more confidence
    const totalOccurrences = patterns.reduce((sum, p) => sum + p.occurrences, 0);
    confidence += Math.min(0.2, totalOccurrences / 500);

    // High probability primary outcome = more confidence
    if (outcomes.length > 0 && outcomes[0].probability > 0.7) {
      confidence += 0.15;
    }

    // Clear separation between outcomes = more confidence
    if (outcomes.length >= 2) {
      const separation = outcomes[0].probability - outcomes[1].probability;
      confidence += Math.min(0.1, separation * 0.5);
    }

    return Math.min(0.95, Math.max(0.1, confidence));
  }

  // ============================================================================
  // Reasoning
  // ============================================================================

  private generateReasoning(patterns: Pattern[], outcomes: PredictedOutcome[]): string {
    const reasons: string[] = [];

    if (patterns.length === 0) {
      reasons.push('No direct patterns found; using baseline probabilities.');
    } else {
      reasons.push(`Based on ${patterns.length} matching pattern(s).`);

      // Mention strongest pattern
      const strongest = patterns.reduce((max, p) =>
        p.successRate * p.occurrences > max.successRate * max.occurrences ? p : max
      , patterns[0]);

      reasons.push(`Strongest pattern: "${strongest.id}" (${(strongest.successRate * 100).toFixed(0)}% success rate, ${strongest.occurrences} observations).`);
    }

    if (outcomes.length > 0) {
      const primary = outcomes[0];
      reasons.push(`Most likely outcome: ${primary.description} (${(primary.probability * 100).toFixed(0)}% probability).`);
    }

    return reasons.join(' ');
  }

  // ============================================================================
  // Feedback (Learning)
  // ============================================================================

  private async handleFeedback(message: Message): Promise<Message | null> {
    const { predictionId, actualOutcome, correct } = message.payload;

    const prediction = this.predictions.get(predictionId);
    if (prediction) {
      prediction.verified = true;
      prediction.actualOutcome = actualOutcome;

      // Learn from this feedback
      this.learn(prediction, actualOutcome, correct);

      this.log(`Feedback received: prediction ${predictionId.slice(0, 8)} was ${correct ? 'correct' : 'incorrect'}`);
    }

    // Add to history
    this.history.push({
      query: prediction?.query || message.payload.query,
      outcome: actualOutcome,
      timestamp: new Date(),
      context: message.payload.context,
    });

    // Keep history bounded
    if (this.history.length > 1000) {
      this.history.shift();
    }

    return {
      ...this.createResponse(message, 'RESPONSE', { success: true }),
      id: '',
      timestamp: new Date(),
    };
  }

  private learn(prediction: Prediction, actualOutcome: string, correct: boolean): void {
    // Update patterns based on feedback
    const queryLower = prediction.query.toLowerCase();

    for (const pattern of this.patterns.values()) {
      // Check if this pattern was relevant
      const wasRelevant = pattern.conditions.some((c) =>
        queryLower.includes(c.replace(/_/g, ' '))
      );

      if (wasRelevant) {
        pattern.occurrences++;
        pattern.lastSeen = new Date();

        if (correct && pattern.outcome.includes(actualOutcome.replace(/ /g, '_'))) {
          // Prediction was correct and matched this pattern
          pattern.successRate = (pattern.successRate * (pattern.occurrences - 1) + 1) / pattern.occurrences;
        } else if (!correct) {
          // Prediction was wrong
          pattern.successRate = (pattern.successRate * (pattern.occurrences - 1)) / pattern.occurrences;
        }
      }
    }

    // Potentially create new pattern if we see a repeated outcome
    const similarHistory = this.history.filter((h) =>
      h.outcome === actualOutcome &&
      h.query.toLowerCase().split(/\s+/).some((w) => queryLower.includes(w))
    );

    if (similarHistory.length >= 3) {
      const newPatternId = `learned-${actualOutcome.replace(/ /g, '-').toLowerCase()}`;
      if (!this.patterns.has(newPatternId)) {
        this.patterns.set(newPatternId, {
          id: newPatternId,
          conditions: [prediction.query.toLowerCase()],
          outcome: actualOutcome.replace(/ /g, '_'),
          occurrences: similarHistory.length,
          successRate: correct ? 0.7 : 0.3,
          lastSeen: new Date(),
        });
        this.log(`Learned new pattern: ${newPatternId}`);
      }
    }
  }

  // ============================================================================
  // Query & Commands
  // ============================================================================

  private async handleQuery(message: Message): Promise<Message | null> {
    const { query, predictionId } = message.payload;

    if (query === 'prediction' && predictionId) {
      const prediction = this.predictions.get(predictionId);
      return {
        ...this.createResponse(message, 'RESPONSE', { prediction }),
        id: '',
        timestamp: new Date(),
      };
    }

    if (query === 'patterns') {
      return {
        ...this.createResponse(message, 'RESPONSE', {
          patterns: Array.from(this.patterns.values()),
        }),
        id: '',
        timestamp: new Date(),
      };
    }

    if (query === 'stats') {
      return {
        ...this.createResponse(message, 'RESPONSE', this.getStats()),
        id: '',
        timestamp: new Date(),
      };
    }

    if (query === 'accuracy') {
      return {
        ...this.createResponse(message, 'RESPONSE', {
          accuracy: this.calculateAccuracy(),
        }),
        id: '',
        timestamp: new Date(),
      };
    }

    return null;
  }

  private async handleCommand(message: Message): Promise<Message | null> {
    const { command, params } = message.payload;

    switch (command) {
      case 'add_pattern':
        this.patterns.set(params.id, params);
        return {
          ...this.createResponse(message, 'RESPONSE', { success: true }),
          id: '',
          timestamp: new Date(),
        };

      case 'execute_step':
        // Predict outcome for a step
        const prediction = this.predict(params.step, {
          conditions: [params.planId, params.stepId],
        });
        return {
          ...this.createResponse(message, 'RESPONSE', { prediction }),
          id: '',
          timestamp: new Date(),
        };

      default:
        return null;
    }
  }

  // ============================================================================
  // Stats
  // ============================================================================

  getStats() {
    const verified = Array.from(this.predictions.values()).filter((p) => p.verified);
    const correct = verified.filter((p) =>
      p.outcomes[0]?.description.toLowerCase().includes(p.actualOutcome?.toLowerCase() || '')
    );

    return {
      totalPredictions: this.predictions.size,
      verifiedPredictions: verified.length,
      accuracy: verified.length > 0 ? correct.length / verified.length : 0,
      patterns: this.patterns.size,
      historySize: this.history.length,
      avgConfidence: this.calculateAvgConfidence(),
    };
  }

  private calculateAccuracy(): {
    overall: number;
    byHorizon: Record<string, number>;
    byConfidence: { high: number; medium: number; low: number };
  } {
    const verified = Array.from(this.predictions.values()).filter((p) => p.verified);

    if (verified.length === 0) {
      return {
        overall: 0,
        byHorizon: {},
        byConfidence: { high: 0, medium: 0, low: 0 },
      };
    }

    // Count correct predictions
    const isCorrect = (p: Prediction) =>
      p.outcomes[0]?.description.toLowerCase().includes(p.actualOutcome?.toLowerCase() || '');

    const correct = verified.filter(isCorrect);
    const overall = correct.length / verified.length;

    // By horizon
    const byHorizon: Record<string, number> = {};
    const horizons = new Set(verified.map((p) => p.horizon));
    for (const horizon of horizons) {
      const horizonPredictions = verified.filter((p) => p.horizon === horizon);
      const horizonCorrect = horizonPredictions.filter(isCorrect);
      byHorizon[horizon] = horizonPredictions.length > 0
        ? horizonCorrect.length / horizonPredictions.length
        : 0;
    }

    // By confidence level
    const highConf = verified.filter((p) => p.confidence >= 0.7);
    const medConf = verified.filter((p) => p.confidence >= 0.4 && p.confidence < 0.7);
    const lowConf = verified.filter((p) => p.confidence < 0.4);

    return {
      overall,
      byHorizon,
      byConfidence: {
        high: highConf.length > 0 ? highConf.filter(isCorrect).length / highConf.length : 0,
        medium: medConf.length > 0 ? medConf.filter(isCorrect).length / medConf.length : 0,
        low: lowConf.length > 0 ? lowConf.filter(isCorrect).length / lowConf.length : 0,
      },
    };
  }

  private calculateAvgConfidence(): number {
    const predictions = Array.from(this.predictions.values());
    if (predictions.length === 0) return 0;

    return predictions.reduce((sum, p) => sum + p.confidence, 0) / predictions.length;
  }
}

// ============================================================================
// Register Factory
// ============================================================================

registerAgentFactory('predictor', (bus) => new PredictorAgent(bus));

export function createPredictorAgent(bus?: MessageBus): PredictorAgent {
  return new PredictorAgent(bus);
}
