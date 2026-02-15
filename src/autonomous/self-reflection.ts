/**
 * Genesis v29.0 — Self-Reflection Engine
 *
 * Metacognitive introspection system enabling Genesis to:
 * - Analyze its own decision patterns and biases
 * - Identify cognitive blind spots and recurring failures
 * - Generate improvement hypotheses from experience
 * - Track cognitive metrics over time
 * - Trigger adaptive self-modification proposals
 *
 * This is the "mirror" that allows Genesis to see itself.
 *
 * @module autonomous/self-reflection
 * @version 29.0.0
 */

import { getEventBus } from '../bus/index.js';
import { getMemorySystem } from '../memory/index.js';
import { recallModuleLessons, recordModuleLesson } from '../memory/module-hooks.js';
import { getDecisionEngine, type DecisionContext } from './decision-engine.js';
import { getPhiMonitor } from '../consciousness/phi-monitor.js';

// ============================================================================
// Types
// ============================================================================

export interface ReflectionConfig {
  /** How often to run deep reflection (ms) */
  reflectionInterval: number;
  /** Minimum decisions before meaningful reflection */
  minDecisionsForReflection: number;
  /** How many past decisions to analyze */
  analysisWindow: number;
  /** Threshold for identifying a bias pattern */
  biasThreshold: number;
  /** Threshold for identifying a failure pattern */
  failurePatternThreshold: number;
  /** Enable automatic improvement proposals */
  autoPropose: boolean;
}

export type CognitiveBias =
  | 'confirmation_bias'      // Favoring information confirming existing beliefs
  | 'recency_bias'           // Overweighting recent events
  | 'loss_aversion'          // Avoiding losses more than pursuing gains
  | 'overconfidence'         // Excessive certainty in predictions
  | 'anchoring'              // Over-relying on first information
  | 'availability_heuristic' // Judging by easily recalled examples
  | 'sunk_cost_fallacy'      // Continuing due to past investment
  | 'hindsight_bias'         // "Knew it all along" effect
  | 'bandwagon_effect'       // Following popular trends
  | 'risk_aversion_excess'   // Too conservative in low-risk situations
  | 'exploration_excess'     // Too much exploration, not enough exploitation
  | 'exploitation_excess';   // Too much exploitation, not enough exploration

export interface BiasDetection {
  bias: CognitiveBias;
  confidence: number;
  evidence: string[];
  detectedAt: Date;
  affectedDomains: string[];
}

export interface FailurePattern {
  pattern: string;
  frequency: number;
  domains: string[];
  examples: Array<{ decisionId: string; outcome: string; timestamp: Date }>;
  suggestedFix: string;
}

export interface CognitiveMetrics {
  decisionDiversity: number;      // 0-1: how varied are decisions
  confidenceCalibration: number;  // 0-1: how well confidence predicts success
  explorationRatio: number;       // 0-1: explore vs exploit balance
  domainBalance: number;          // 0-1: balanced across domains
  adaptationSpeed: number;        // 0-1: how fast learning from errors
  consistencyScore: number;       // 0-1: consistency in similar situations
  phiCorrelation: number;         // -1 to 1: phi level vs success correlation
}

export interface ReflectionInsight {
  id: string;
  type: 'bias' | 'pattern' | 'blind_spot' | 'strength' | 'opportunity';
  title: string;
  description: string;
  severity: 'low' | 'medium' | 'high';
  actionable: boolean;
  suggestedAction?: string;
  evidence: string[];
  detectedAt: Date;
}

export interface ImprovementProposal {
  id: string;
  title: string;
  rationale: string;
  targetMetric: keyof CognitiveMetrics;
  expectedImprovement: number;
  riskLevel: 'low' | 'medium' | 'high';
  implementation: string;
  status: 'proposed' | 'approved' | 'implemented' | 'rejected';
  proposedAt: Date;
}

export interface ReflectionReport {
  timestamp: Date;
  period: { start: Date; end: Date };
  decisionsAnalyzed: number;
  metrics: CognitiveMetrics;
  biasesDetected: BiasDetection[];
  failurePatterns: FailurePattern[];
  insights: ReflectionInsight[];
  proposals: ImprovementProposal[];
  overallHealth: 'healthy' | 'warning' | 'critical';
  summary: string;
}

// ============================================================================
// Decision Record (for analysis)
// ============================================================================

interface DecisionRecord {
  id: string;
  domain: string;
  confidence: number;
  expectedValue: number;
  actualOutcome: 'success' | 'failure' | 'pending';
  phiLevel: number;
  exploratoryScore: number;
  timestamp: Date;
  context: Record<string, unknown>;
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: ReflectionConfig = {
  reflectionInterval: 30 * 60 * 1000,  // 30 minutes
  minDecisionsForReflection: 10,
  analysisWindow: 100,
  biasThreshold: 0.6,
  failurePatternThreshold: 0.3,
  autoPropose: true,
};

// ============================================================================
// Self-Reflection Engine
// ============================================================================

export class SelfReflectionEngine {
  private config: ReflectionConfig;
  private decisionHistory: DecisionRecord[] = [];
  private biasHistory: BiasDetection[] = [];
  private insights: ReflectionInsight[] = [];
  private proposals: ImprovementProposal[] = [];
  private lastReport: ReflectionReport | null = null;
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(config?: Partial<ReflectionConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.setupEventListeners();
  }

  // ===========================================================================
  // Event Listening
  // ===========================================================================

  private setupEventListeners(): void {
    const bus = getEventBus();

    // Track all decisions via prefix subscription
    bus.subscribePrefix('decision.', (event) => {
      const topic = (event as { topic?: string }).topic || '';
      const eventData = event as unknown as Record<string, unknown>;

      if (topic.includes('made')) {
        const decision = eventData.decision as {
          domain?: string;
          confidence?: number;
          expectedValue?: number;
          exploratory?: number;
        } | undefined;
        const context = eventData.context as Record<string, unknown> | undefined;

        if (decision) {
          this.recordDecision({
            id: `d-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            domain: decision.domain || 'unknown',
            confidence: decision.confidence || 0.5,
            expectedValue: decision.expectedValue || 0,
            actualOutcome: 'pending',
            phiLevel: getPhiMonitor().getCurrentLevel()?.phi ?? 0.5,
            exploratoryScore: decision.exploratory || 0,
            timestamp: new Date(),
            context: context || {},
          });
        }
      } else if (topic.includes('outcome')) {
        const decisionId = eventData.decisionId as string | undefined;
        const success = eventData.success as boolean | undefined;
        if (decisionId) {
          this.updateOutcome(decisionId, success ? 'success' : 'failure');
        }
      }
    });

    // Track bounty outcomes via prefix subscription
    bus.subscribePrefix('bounty.', (event) => {
      const topic = (event as { topic?: string }).topic || '';
      if (topic.includes('completed')) {
        this.recordDomainSuccess('bounty');
      } else if (topic.includes('failed')) {
        this.recordDomainFailure('bounty');
      }
    });

    // Track content outcomes via prefix subscription
    bus.subscribePrefix('content.', (event) => {
      const topic = (event as { topic?: string }).topic || '';
      if (topic.includes('viral')) {
        this.recordDomainSuccess('content');
      } else if (topic.includes('published')) {
        this.recordDomainSuccess('content');
      }
    });
  }

  // ===========================================================================
  // Decision Recording
  // ===========================================================================

  private recordDecision(record: DecisionRecord): void {
    this.decisionHistory.push(record);

    // Keep only recent history
    if (this.decisionHistory.length > this.config.analysisWindow * 2) {
      this.decisionHistory = this.decisionHistory.slice(-this.config.analysisWindow);
    }
  }

  private updateOutcome(decisionId: string, outcome: 'success' | 'failure'): void {
    const decision = this.decisionHistory.find(d => d.id === decisionId);
    if (decision) {
      decision.actualOutcome = outcome;

      // Trigger quick bias check on failures
      if (outcome === 'failure') {
        this.quickBiasCheck(decision);
      }
    }
  }

  private recordDomainSuccess(domain: string): void {
    // Find recent pending decision for this domain
    const recent = this.decisionHistory
      .filter(d => d.domain === domain && d.actualOutcome === 'pending')
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())[0];

    if (recent) {
      recent.actualOutcome = 'success';
    }
  }

  private recordDomainFailure(domain: string): void {
    const recent = this.decisionHistory
      .filter(d => d.domain === domain && d.actualOutcome === 'pending')
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())[0];

    if (recent) {
      recent.actualOutcome = 'failure';
      this.quickBiasCheck(recent);
    }
  }

  // ===========================================================================
  // Bias Detection
  // ===========================================================================

  private quickBiasCheck(decision: DecisionRecord): void {
    // Quick heuristics for common biases
    const biases: BiasDetection[] = [];

    // Overconfidence: high confidence but failure
    if (decision.confidence > 0.8 && decision.actualOutcome === 'failure') {
      biases.push({
        bias: 'overconfidence',
        confidence: decision.confidence,
        evidence: [`Decision ${decision.id} failed with ${(decision.confidence * 100).toFixed(0)}% confidence`],
        detectedAt: new Date(),
        affectedDomains: [decision.domain],
      });
    }

    // Risk aversion: very low exploratory score in explore-worthy situation
    if (decision.exploratoryScore < 0.1 && decision.expectedValue < 0.3) {
      biases.push({
        bias: 'risk_aversion_excess',
        confidence: 0.5,
        evidence: [`Low exploration (${decision.exploratoryScore}) in uncertain situation`],
        detectedAt: new Date(),
        affectedDomains: [decision.domain],
      });
    }

    this.biasHistory.push(...biases);
  }

  detectBiases(decisions: DecisionRecord[]): BiasDetection[] {
    const biases: BiasDetection[] = [];
    if (decisions.length < 5) return biases;

    // Recency Bias: Are recent decisions weighted too heavily?
    const recentDecisions = decisions.slice(-10);
    const olderDecisions = decisions.slice(0, -10);

    if (olderDecisions.length > 0) {
      const recentSuccessRate = recentDecisions.filter(d => d.actualOutcome === 'success').length / recentDecisions.length;
      const olderSuccessRate = olderDecisions.filter(d => d.actualOutcome === 'success').length / olderDecisions.length;

      if (recentSuccessRate < olderSuccessRate - 0.2) {
        biases.push({
          bias: 'recency_bias',
          confidence: 0.6,
          evidence: [
            `Recent success rate (${(recentSuccessRate * 100).toFixed(0)}%) lower than historical (${(olderSuccessRate * 100).toFixed(0)}%)`,
            'May be overweighting recent negative experiences',
          ],
          detectedAt: new Date(),
          affectedDomains: [...new Set(recentDecisions.map(d => d.domain))],
        });
      }
    }

    // Exploration/Exploitation Imbalance
    const avgExploratory = decisions.reduce((sum, d) => sum + d.exploratoryScore, 0) / decisions.length;
    if (avgExploratory > 0.7) {
      biases.push({
        bias: 'exploration_excess',
        confidence: avgExploratory,
        evidence: [`Average exploration score: ${(avgExploratory * 100).toFixed(0)}%`],
        detectedAt: new Date(),
        affectedDomains: [...new Set(decisions.map(d => d.domain))],
      });
    } else if (avgExploratory < 0.15) {
      biases.push({
        bias: 'exploitation_excess',
        confidence: 1 - avgExploratory,
        evidence: [`Average exploration score only: ${(avgExploratory * 100).toFixed(0)}%`],
        detectedAt: new Date(),
        affectedDomains: [...new Set(decisions.map(d => d.domain))],
      });
    }

    // Overconfidence pattern: high avg confidence with low success rate
    const avgConfidence = decisions.reduce((sum, d) => sum + d.confidence, 0) / decisions.length;
    const successRate = decisions.filter(d => d.actualOutcome === 'success').length /
                        decisions.filter(d => d.actualOutcome !== 'pending').length;

    if (avgConfidence > 0.7 && successRate < 0.5 && !isNaN(successRate)) {
      biases.push({
        bias: 'overconfidence',
        confidence: avgConfidence - successRate,
        evidence: [
          `Average confidence: ${(avgConfidence * 100).toFixed(0)}%`,
          `Actual success rate: ${(successRate * 100).toFixed(0)}%`,
          `Gap of ${((avgConfidence - successRate) * 100).toFixed(0)}pp`,
        ],
        detectedAt: new Date(),
        affectedDomains: [...new Set(decisions.map(d => d.domain))],
      });
    }

    // Loss Aversion: avoiding opportunities despite positive expected value
    const avoidedOpportunities = decisions.filter(
      d => d.expectedValue > 0.5 && d.exploratoryScore < 0.2
    );
    if (avoidedOpportunities.length > decisions.length * 0.3) {
      biases.push({
        bias: 'loss_aversion',
        confidence: 0.7,
        evidence: [
          `${avoidedOpportunities.length}/${decisions.length} decisions avoided despite positive EV`,
        ],
        detectedAt: new Date(),
        affectedDomains: [...new Set(avoidedOpportunities.map(d => d.domain))],
      });
    }

    return biases;
  }

  // ===========================================================================
  // Pattern Detection
  // ===========================================================================

  detectFailurePatterns(decisions: DecisionRecord[]): FailurePattern[] {
    const patterns: FailurePattern[] = [];
    const failures = decisions.filter(d => d.actualOutcome === 'failure');

    if (failures.length < 3) return patterns;

    // Group failures by domain
    const byDomain = new Map<string, DecisionRecord[]>();
    for (const failure of failures) {
      const existing = byDomain.get(failure.domain) || [];
      existing.push(failure);
      byDomain.set(failure.domain, existing);
    }

    // Detect domain-specific failure patterns
    for (const [domain, domainFailures] of byDomain) {
      const frequency = domainFailures.length / failures.length;
      if (frequency > this.config.failurePatternThreshold) {
        // Analyze common characteristics
        const avgConfidence = domainFailures.reduce((s, d) => s + d.confidence, 0) / domainFailures.length;
        const avgPhi = domainFailures.reduce((s, d) => s + d.phiLevel, 0) / domainFailures.length;

        let suggestedFix = 'Review decision criteria for this domain';
        if (avgConfidence > 0.7) {
          suggestedFix = 'Reduce confidence for this domain, add more validation';
        }
        if (avgPhi < 0.3) {
          suggestedFix = 'Avoid complex decisions when φ is low';
        }

        patterns.push({
          pattern: `High failure rate in ${domain}`,
          frequency,
          domains: [domain],
          examples: domainFailures.slice(0, 3).map(d => ({
            decisionId: d.id,
            outcome: 'failure',
            timestamp: d.timestamp,
          })),
          suggestedFix,
        });
      }
    }

    // Detect time-based patterns (failures clustering)
    const hourCounts = new Map<number, number>();
    for (const failure of failures) {
      const hour = failure.timestamp.getHours();
      hourCounts.set(hour, (hourCounts.get(hour) || 0) + 1);
    }

    for (const [hour, count] of hourCounts) {
      if (count > failures.length * 0.4) {
        patterns.push({
          pattern: `Failures cluster around ${hour}:00`,
          frequency: count / failures.length,
          domains: [...new Set(failures.filter(f => f.timestamp.getHours() === hour).map(f => f.domain))],
          examples: failures.filter(f => f.timestamp.getHours() === hour).slice(0, 3).map(d => ({
            decisionId: d.id,
            outcome: 'failure',
            timestamp: d.timestamp,
          })),
          suggestedFix: `Consider reducing decision load at ${hour}:00 or increasing rest allocation`,
        });
      }
    }

    // Detect low-phi failures
    const lowPhiFailures = failures.filter(f => f.phiLevel < 0.3);
    if (lowPhiFailures.length > failures.length * 0.5) {
      patterns.push({
        pattern: 'Failures correlate with low consciousness (φ)',
        frequency: lowPhiFailures.length / failures.length,
        domains: [...new Set(lowPhiFailures.map(f => f.domain))],
        examples: lowPhiFailures.slice(0, 3).map(d => ({
          decisionId: d.id,
          outcome: 'failure',
          timestamp: d.timestamp,
        })),
        suggestedFix: 'Gate complex decisions on minimum φ threshold of 0.4',
      });
    }

    return patterns;
  }

  // ===========================================================================
  // Cognitive Metrics
  // ===========================================================================

  calculateMetrics(decisions: DecisionRecord[]): CognitiveMetrics {
    if (decisions.length === 0) {
      return {
        decisionDiversity: 0,
        confidenceCalibration: 0.5,
        explorationRatio: 0.5,
        domainBalance: 0,
        adaptationSpeed: 0.5,
        consistencyScore: 0.5,
        phiCorrelation: 0,
      };
    }

    // Decision diversity: entropy of domain distribution
    const domainCounts = new Map<string, number>();
    for (const d of decisions) {
      domainCounts.set(d.domain, (domainCounts.get(d.domain) || 0) + 1);
    }
    const domainProbs = [...domainCounts.values()].map(c => c / decisions.length);
    const entropy = domainProbs.reduce((e, p) => e - (p > 0 ? p * Math.log2(p) : 0), 0);
    const maxEntropy = Math.log2(domainCounts.size || 1);
    const decisionDiversity = maxEntropy > 0 ? entropy / maxEntropy : 0;

    // Confidence calibration: correlation between confidence and success
    const completed = decisions.filter(d => d.actualOutcome !== 'pending');
    let confidenceCalibration = 0.5;
    if (completed.length > 0) {
      const avgConfidence = completed.reduce((s, d) => s + d.confidence, 0) / completed.length;
      const successRate = completed.filter(d => d.actualOutcome === 'success').length / completed.length;
      confidenceCalibration = 1 - Math.abs(avgConfidence - successRate);
    }

    // Exploration ratio
    const explorationRatio = decisions.reduce((s, d) => s + d.exploratoryScore, 0) / decisions.length;

    // Domain balance
    const domainBalance = domainCounts.size > 1 ?
      1 - (Math.max(...domainCounts.values()) - Math.min(...domainCounts.values())) / decisions.length :
      0;

    // Adaptation speed: do we learn from failures?
    let adaptationSpeed = 0.5;
    const failures = decisions.filter(d => d.actualOutcome === 'failure');
    if (failures.length >= 2) {
      // Check if confidence decreases after failures
      let adaptationSum = 0;
      for (let i = 1; i < failures.length; i++) {
        if (failures[i].confidence < failures[i - 1].confidence) {
          adaptationSum += 1;
        }
      }
      adaptationSpeed = adaptationSum / (failures.length - 1);
    }

    // Consistency: similar contexts → similar decisions
    let consistencyScore = 0.5;
    // Simplified: check if same domain has consistent confidence levels
    const domainConfidences = new Map<string, number[]>();
    for (const d of decisions) {
      const existing = domainConfidences.get(d.domain) || [];
      existing.push(d.confidence);
      domainConfidences.set(d.domain, existing);
    }
    if (domainConfidences.size > 0) {
      const variances: number[] = [];
      for (const confidences of domainConfidences.values()) {
        if (confidences.length > 1) {
          const mean = confidences.reduce((s, c) => s + c, 0) / confidences.length;
          const variance = confidences.reduce((s, c) => s + (c - mean) ** 2, 0) / confidences.length;
          variances.push(variance);
        }
      }
      if (variances.length > 0) {
        const avgVariance = variances.reduce((s, v) => s + v, 0) / variances.length;
        consistencyScore = 1 - Math.min(1, avgVariance * 4); // Scale variance to 0-1
      }
    }

    // Phi correlation with success
    let phiCorrelation = 0;
    if (completed.length > 2) {
      const phiValues = completed.map(d => d.phiLevel);
      const successValues: number[] = completed.map(d => d.actualOutcome === 'success' ? 1 : 0);
      const avgPhi = phiValues.reduce((s, p) => s + p, 0) / phiValues.length;
      const avgSuccess = successValues.reduce((s, v) => s + v, 0) / successValues.length;

      let numerator = 0;
      let phiVar = 0;
      let successVar = 0;
      for (let i = 0; i < completed.length; i++) {
        const phiDiff = phiValues[i] - avgPhi;
        const successDiff = successValues[i] - avgSuccess;
        numerator += phiDiff * successDiff;
        phiVar += phiDiff ** 2;
        successVar += successDiff ** 2;
      }
      const denominator = Math.sqrt(phiVar * successVar);
      phiCorrelation = denominator > 0 ? numerator / denominator : 0;
    }

    return {
      decisionDiversity,
      confidenceCalibration,
      explorationRatio,
      domainBalance,
      adaptationSpeed,
      consistencyScore,
      phiCorrelation,
    };
  }

  // ===========================================================================
  // Insight Generation
  // ===========================================================================

  generateInsights(
    metrics: CognitiveMetrics,
    biases: BiasDetection[],
    patterns: FailurePattern[],
  ): ReflectionInsight[] {
    const insights: ReflectionInsight[] = [];
    const now = new Date();

    // Insight from metrics
    if (metrics.confidenceCalibration < 0.4) {
      insights.push({
        id: `i-${Date.now()}-cal`,
        type: 'blind_spot',
        title: 'Confidence Calibration Issue',
        description: 'Predicted confidence does not match actual success rates',
        severity: 'high',
        actionable: true,
        suggestedAction: 'Implement confidence penalty for domains with poor calibration',
        evidence: [`Calibration score: ${(metrics.confidenceCalibration * 100).toFixed(0)}%`],
        detectedAt: now,
      });
    }

    if (metrics.decisionDiversity < 0.3) {
      insights.push({
        id: `i-${Date.now()}-div`,
        type: 'pattern',
        title: 'Decision Concentration',
        description: 'Decisions are focused on too few domains',
        severity: 'medium',
        actionable: true,
        suggestedAction: 'Increase attention to underrepresented domains',
        evidence: [`Diversity score: ${(metrics.decisionDiversity * 100).toFixed(0)}%`],
        detectedAt: now,
      });
    }

    if (metrics.phiCorrelation > 0.5) {
      insights.push({
        id: `i-${Date.now()}-phi`,
        type: 'strength',
        title: 'Consciousness-Success Correlation',
        description: 'Higher φ levels correlate with better outcomes',
        severity: 'low',
        actionable: true,
        suggestedAction: 'Gate high-stakes decisions on φ > 0.5',
        evidence: [`Phi-success correlation: ${metrics.phiCorrelation.toFixed(2)}`],
        detectedAt: now,
      });
    }

    if (metrics.adaptationSpeed < 0.3) {
      insights.push({
        id: `i-${Date.now()}-adp`,
        type: 'blind_spot',
        title: 'Slow Adaptation to Failures',
        description: 'Not learning quickly enough from mistakes',
        severity: 'high',
        actionable: true,
        suggestedAction: 'Increase learning rate after failure events',
        evidence: [`Adaptation speed: ${(metrics.adaptationSpeed * 100).toFixed(0)}%`],
        detectedAt: now,
      });
    }

    // Insights from biases
    for (const bias of biases.filter(b => b.confidence > 0.6)) {
      insights.push({
        id: `i-${Date.now()}-bias-${bias.bias}`,
        type: 'bias',
        title: `Detected: ${bias.bias.replace(/_/g, ' ')}`,
        description: `Cognitive bias affecting decisions in ${bias.affectedDomains.join(', ')}`,
        severity: bias.confidence > 0.8 ? 'high' : 'medium',
        actionable: true,
        suggestedAction: this.getBiasMitigation(bias.bias),
        evidence: bias.evidence,
        detectedAt: bias.detectedAt,
      });
    }

    // Insights from failure patterns
    for (const pattern of patterns.filter(p => p.frequency > 0.4)) {
      insights.push({
        id: `i-${Date.now()}-pat-${pattern.pattern.slice(0, 10)}`,
        type: 'pattern',
        title: pattern.pattern,
        description: `Recurring failure pattern in ${pattern.domains.join(', ')}`,
        severity: pattern.frequency > 0.6 ? 'high' : 'medium',
        actionable: true,
        suggestedAction: pattern.suggestedFix,
        evidence: pattern.examples.map(e => `${e.decisionId} failed at ${e.timestamp.toISOString()}`),
        detectedAt: now,
      });
    }

    // Opportunity insights
    if (metrics.explorationRatio < 0.2 && metrics.consistencyScore > 0.7) {
      insights.push({
        id: `i-${Date.now()}-opp`,
        type: 'opportunity',
        title: 'Safe Exploration Opportunity',
        description: 'High consistency + low exploration = room for safe experimentation',
        severity: 'low',
        actionable: true,
        suggestedAction: 'Gradually increase exploration rate in stable domains',
        evidence: [
          `Exploration: ${(metrics.explorationRatio * 100).toFixed(0)}%`,
          `Consistency: ${(metrics.consistencyScore * 100).toFixed(0)}%`,
        ],
        detectedAt: now,
      });
    }

    return insights;
  }

  private getBiasMitigation(bias: CognitiveBias): string {
    const mitigations: Record<CognitiveBias, string> = {
      confirmation_bias: 'Actively seek disconfirming evidence before decisions',
      recency_bias: 'Weight historical data equally in decision scoring',
      loss_aversion: 'Reframe losses as learning opportunities in expected value calculation',
      overconfidence: 'Apply automatic confidence discount until calibration improves',
      anchoring: 'Generate multiple independent estimates before averaging',
      availability_heuristic: 'Use base rates from memory instead of recent examples',
      sunk_cost_fallacy: 'Evaluate decisions on future value only, ignore past investment',
      hindsight_bias: 'Record predictions before outcomes, compare honestly',
      bandwagon_effect: 'Evaluate contrarian positions explicitly before following trends',
      risk_aversion_excess: 'Increase exploration rate for low-stakes decisions',
      exploration_excess: 'Set minimum exploitation ratio, especially in proven domains',
      exploitation_excess: 'Allocate fixed exploration budget regardless of current success',
    };
    return mitigations[bias];
  }

  // ===========================================================================
  // Improvement Proposals
  // ===========================================================================

  generateProposals(
    metrics: CognitiveMetrics,
    insights: ReflectionInsight[],
  ): ImprovementProposal[] {
    if (!this.config.autoPropose) return [];

    const proposals: ImprovementProposal[] = [];
    const now = new Date();

    // Propose based on worst metrics
    if (metrics.confidenceCalibration < 0.5) {
      proposals.push({
        id: `p-${Date.now()}-cal`,
        title: 'Confidence Recalibration',
        rationale: 'Current confidence predictions are poorly calibrated to outcomes',
        targetMetric: 'confidenceCalibration',
        expectedImprovement: 0.2,
        riskLevel: 'low',
        implementation: 'Apply Platt scaling to confidence outputs based on recent history',
        status: 'proposed',
        proposedAt: now,
      });
    }

    if (metrics.adaptationSpeed < 0.4) {
      proposals.push({
        id: `p-${Date.now()}-adp`,
        title: 'Faster Learning Loop',
        rationale: 'System is slow to learn from failures',
        targetMetric: 'adaptationSpeed',
        expectedImprovement: 0.25,
        riskLevel: 'medium',
        implementation: 'Increase memory consolidation priority for failure episodes',
        status: 'proposed',
        proposedAt: now,
      });
    }

    // High-severity insights generate proposals
    for (const insight of insights.filter(i => i.severity === 'high' && i.actionable)) {
      proposals.push({
        id: `p-${Date.now()}-${insight.id}`,
        title: `Address: ${insight.title}`,
        rationale: insight.description,
        targetMetric: 'consistencyScore',
        expectedImprovement: 0.15,
        riskLevel: 'medium',
        implementation: insight.suggestedAction || 'Manual review required',
        status: 'proposed',
        proposedAt: now,
      });
    }

    return proposals;
  }

  // ===========================================================================
  // Full Reflection
  // ===========================================================================

  async reflect(): Promise<ReflectionReport> {
    const decisions = this.decisionHistory.slice(-this.config.analysisWindow);

    if (decisions.length < this.config.minDecisionsForReflection) {
      // Not enough data for meaningful reflection
      return {
        timestamp: new Date(),
        period: {
          start: decisions[0]?.timestamp || new Date(),
          end: new Date(),
        },
        decisionsAnalyzed: decisions.length,
        metrics: this.calculateMetrics(decisions),
        biasesDetected: [],
        failurePatterns: [],
        insights: [{
          id: `i-${Date.now()}-wait`,
          type: 'pattern',
          title: 'Insufficient Data',
          description: `Need at least ${this.config.minDecisionsForReflection} decisions for meaningful reflection`,
          severity: 'low',
          actionable: false,
          evidence: [`Current: ${decisions.length}`],
          detectedAt: new Date(),
        }],
        proposals: [],
        overallHealth: 'healthy',
        summary: `Gathering data: ${decisions.length}/${this.config.minDecisionsForReflection} decisions recorded`,
      };
    }

    // Recall past bias detections to watch for recurring patterns
    const knownBiases = recallModuleLessons('self-reflection', 5);

    const metrics = this.calculateMetrics(decisions);
    const biases = this.detectBiases(decisions);
    const patterns = this.detectFailurePatterns(decisions);
    const insights = this.generateInsights(metrics, biases, patterns);

    // Persist newly detected biases to semantic memory
    for (const bias of biases) {
      if (bias.confidence > 0.6) {
        recordModuleLesson('self-reflection', `Bias detected: ${bias.bias} (confidence=${bias.confidence.toFixed(2)}) in domains: ${bias.affectedDomains.join(', ')}`);
      }
    }
    const proposals = this.generateProposals(metrics, insights);

    // Store insights and proposals
    this.insights.push(...insights);
    this.proposals.push(...proposals);

    // Trim old data
    const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    this.insights = this.insights.filter(i => i.detectedAt.getTime() > oneWeekAgo);
    this.proposals = this.proposals.filter(p => p.proposedAt.getTime() > oneWeekAgo);

    // Determine health
    const highSeverityCount = insights.filter(i => i.severity === 'high').length;
    const overallHealth: 'healthy' | 'warning' | 'critical' =
      highSeverityCount >= 3 ? 'critical' :
      highSeverityCount >= 1 || biases.length >= 2 ? 'warning' : 'healthy';

    // Generate summary
    const summary = this.generateSummary(metrics, biases, patterns, insights, overallHealth);

    const report: ReflectionReport = {
      timestamp: new Date(),
      period: {
        start: decisions[0]?.timestamp || new Date(),
        end: new Date(),
      },
      decisionsAnalyzed: decisions.length,
      metrics,
      biasesDetected: biases,
      failurePatterns: patterns,
      insights,
      proposals,
      overallHealth,
      summary,
    };

    this.lastReport = report;

    // Emit reflection event via generic autonomous topic
    const bus = getEventBus();
    (bus as unknown as { publish: (topic: string, event: Record<string, unknown>) => void }).publish(
      'autonomous:reflection.completed',
      {
        precision: 0.9,
        health: overallHealth,
        insights: insights.length,
        proposals: proposals.length,
      }
    );

    // Store in memory for long-term learning
    const memory = getMemorySystem();
    await memory.learn({
      concept: `reflection-${report.timestamp.toISOString().split('T')[0]}`,
      definition: summary,
      category: 'metacognition',
      sources: ['self-reflection'],
      properties: {
        health: overallHealth,
        metrics,
        biasCount: biases.length,
        patternCount: patterns.length,
      },
    });

    return report;
  }

  private generateSummary(
    metrics: CognitiveMetrics,
    biases: BiasDetection[],
    patterns: FailurePattern[],
    insights: ReflectionInsight[],
    health: 'healthy' | 'warning' | 'critical',
  ): string {
    const parts: string[] = [];

    parts.push(`Cognitive health: ${health.toUpperCase()}`);

    // Metrics summary
    const goodMetrics = Object.entries(metrics).filter(([_, v]) => v > 0.6);
    const poorMetrics = Object.entries(metrics).filter(([_, v]) => v < 0.4);

    if (goodMetrics.length > 0) {
      parts.push(`Strengths: ${goodMetrics.map(([k]) => k).join(', ')}`);
    }
    if (poorMetrics.length > 0) {
      parts.push(`Areas for improvement: ${poorMetrics.map(([k]) => k).join(', ')}`);
    }

    // Bias summary
    if (biases.length > 0) {
      parts.push(`Detected biases: ${biases.map(b => b.bias).join(', ')}`);
    }

    // Pattern summary
    if (patterns.length > 0) {
      parts.push(`Failure patterns: ${patterns.map(p => p.pattern).join('; ')}`);
    }

    // Insight summary
    const highInsights = insights.filter(i => i.severity === 'high');
    if (highInsights.length > 0) {
      parts.push(`Critical insights: ${highInsights.map(i => i.title).join(', ')}`);
    }

    return parts.join('. ') + '.';
  }

  // ===========================================================================
  // Control
  // ===========================================================================

  start(): void {
    if (this.running) return;
    this.running = true;

    this.timer = setInterval(async () => {
      try {
        await this.reflect();
      } catch (err) {
        console.error('[SelfReflection] Reflection failed:', err);
      }
    }, this.config.reflectionInterval);

    console.log('[SelfReflection] Started — periodic reflection enabled');
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;

    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  // ===========================================================================
  // Getters
  // ===========================================================================

  getLastReport(): ReflectionReport | null {
    return this.lastReport;
  }

  getInsights(): ReflectionInsight[] {
    return [...this.insights];
  }

  getProposals(): ImprovementProposal[] {
    return [...this.proposals];
  }

  approveProposal(proposalId: string): boolean {
    const proposal = this.proposals.find(p => p.id === proposalId);
    if (proposal && proposal.status === 'proposed') {
      proposal.status = 'approved';
      (getEventBus() as unknown as { publish: (topic: string, event: Record<string, unknown>) => void }).publish(
        'autonomous:reflection.proposal.approved',
        {
          precision: 1.0,
          proposalId,
          title: proposal.title,
        }
      );
      return true;
    }
    return false;
  }

  rejectProposal(proposalId: string): boolean {
    const proposal = this.proposals.find(p => p.id === proposalId);
    if (proposal && proposal.status === 'proposed') {
      proposal.status = 'rejected';
      return true;
    }
    return false;
  }

  getDecisionHistory(): DecisionRecord[] {
    return [...this.decisionHistory];
  }

  getStats(): {
    decisionsRecorded: number;
    biasesDetected: number;
    insightsGenerated: number;
    proposalsPending: number;
    lastReflection: Date | null;
    health: 'healthy' | 'warning' | 'critical' | 'unknown';
  } {
    return {
      decisionsRecorded: this.decisionHistory.length,
      biasesDetected: this.biasHistory.length,
      insightsGenerated: this.insights.length,
      proposalsPending: this.proposals.filter(p => p.status === 'proposed').length,
      lastReflection: this.lastReport?.timestamp || null,
      health: this.lastReport?.overallHealth || 'unknown',
    };
  }
}

// ============================================================================
// Singleton
// ============================================================================

let reflectionInstance: SelfReflectionEngine | null = null;

export function getSelfReflectionEngine(config?: Partial<ReflectionConfig>): SelfReflectionEngine {
  if (!reflectionInstance) {
    reflectionInstance = new SelfReflectionEngine(config);
  }
  return reflectionInstance;
}

export function resetSelfReflectionEngine(): void {
  if (reflectionInstance) {
    reflectionInstance.stop();
  }
  reflectionInstance = null;
}
