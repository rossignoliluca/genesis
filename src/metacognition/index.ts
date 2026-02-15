/**
 * Metacognition Module - Self-aware reasoning and confidence calibration
 *
 * Implements metacognitive capabilities:
 * - Self-model: Internal representation of own capabilities
 * - Confidence calibration: Accurate uncertainty estimation
 * - Error detection: Identify own mistakes and hallucinations
 * - Self-correction: Learn from errors via RL (SCoRe)
 *
 * Based on MUSE framework and Agent-as-Judge paradigms.
 */

import { EventEmitter } from 'events';
import { createPublisher } from '../bus/index.js';

const publisher = createPublisher('metacognition');

// ============================================================================
// Types
// ============================================================================

export interface SelfModel {
  capabilities: Map<string, CapabilityEstimate>;
  limitations: Limitation[];
  performanceHistory: PerformanceRecord[];
  currentConfidence: number;
  lastUpdated: number;
}

export interface CapabilityEstimate {
  domain: string;
  competence: number;        // 0-1 estimated ability
  calibration: number;       // How well-calibrated confidence is
  sampleSize: number;        // Number of observations
  lastSuccess: number;       // Timestamp
  lastFailure: number;
}

export interface Limitation {
  type: LimitationType;
  description: string;
  severity: number;          // 0-1
  workaround?: string;
}

export type LimitationType =
  | 'knowledge_cutoff'
  | 'context_length'
  | 'hallucination_prone'
  | 'domain_unfamiliar'
  | 'reasoning_limit'
  | 'tool_unavailable';

export interface PerformanceRecord {
  taskId: string;
  domain: string;
  predictedSuccess: number;
  actualSuccess: boolean;
  timestamp: number;
  feedback?: string;
}

export interface ConfidenceEstimate {
  value: number;             // 0-1 confidence
  calibrationError: number;  // How much off from true probability
  uncertaintySources: UncertaintySource[];
}

export interface UncertaintySource {
  type: 'epistemic' | 'aleatoric';
  source: string;
  magnitude: number;
}

export interface ThoughtAudit {
  thoughtId: string;
  content: string;
  source: 'internal' | 'external' | 'unknown';
  coherence: number;
  groundedness: number;
  insertionRisk: number;     // Risk this was "inserted" (hallucination)
}

export interface CorrectionTrace {
  originalThought: string;
  error: Error;
  analysis: string;
  correction: string;
  confidence: number;
}

export interface MetacognitiveState {
  selfModel: SelfModel;
  currentConfidence: ConfidenceEstimate;
  recentAudits: ThoughtAudit[];
  correctionHistory: CorrectionTrace[];
}

// ============================================================================
// Self Model
// ============================================================================

class SelfModelManager {
  private model: SelfModel;
  private calibrationWindow: number;

  constructor(calibrationWindow: number = 100) {
    this.calibrationWindow = calibrationWindow;
    this.model = {
      capabilities: new Map(),
      limitations: this.initializeLimitations(),
      performanceHistory: [],
      currentConfidence: 0.5,
      lastUpdated: Date.now()
    };
  }

  private initializeLimitations(): Limitation[] {
    return [
      {
        type: 'knowledge_cutoff',
        description: 'Knowledge limited to training data cutoff',
        severity: 0.3,
        workaround: 'Use web search for recent information'
      },
      {
        type: 'hallucination_prone',
        description: 'May generate plausible but incorrect information',
        severity: 0.5,
        workaround: 'Verify facts against reliable sources'
      },
      {
        type: 'context_length',
        description: 'Limited context window affects long documents',
        severity: 0.4,
        workaround: 'Chunk large documents and summarize'
      }
    ];
  }

  /**
   * Estimate competence for a task domain
   */
  estimateCompetence(domain: string): number {
    const capability = this.model.capabilities.get(domain);

    if (!capability) {
      // Unknown domain - return prior
      return 0.5;
    }

    // Weight by recency and sample size
    const recencyWeight = Math.exp(-(Date.now() - capability.lastSuccess) / (24 * 60 * 60 * 1000));
    const sampleWeight = Math.min(1, capability.sampleSize / 20);

    return capability.competence * (0.5 + 0.3 * recencyWeight + 0.2 * sampleWeight);
  }

  /**
   * Update capability estimate based on outcome
   */
  updateCapability(domain: string, success: boolean, predicted: number): void {
    let capability = this.model.capabilities.get(domain);

    if (!capability) {
      capability = {
        domain,
        competence: 0.5,
        calibration: 1.0,
        sampleSize: 0,
        lastSuccess: 0,
        lastFailure: 0
      };
    }

    // Update competence with exponential moving average
    const alpha = 0.1;
    const outcome = success ? 1 : 0;
    capability.competence = alpha * outcome + (1 - alpha) * capability.competence;

    // Update calibration (how close prediction was to outcome)
    const error = Math.abs(predicted - outcome);
    capability.calibration = alpha * (1 - error) + (1 - alpha) * capability.calibration;

    // Update timestamps
    if (success) {
      capability.lastSuccess = Date.now();
    } else {
      capability.lastFailure = Date.now();
    }

    capability.sampleSize++;

    this.model.capabilities.set(domain, capability);
    this.model.lastUpdated = Date.now();

    // Record performance
    this.model.performanceHistory.push({
      taskId: `${domain}-${Date.now()}`,
      domain,
      predictedSuccess: predicted,
      actualSuccess: success,
      timestamp: Date.now()
    });

    // Trim history
    if (this.model.performanceHistory.length > this.calibrationWindow) {
      this.model.performanceHistory.shift();
    }
  }

  /**
   * Get calibration error (ECE - Expected Calibration Error)
   */
  getCalibrationError(): number {
    if (this.model.performanceHistory.length < 10) {
      return 0.5; // Insufficient data
    }

    // Bin predictions and calculate ECE
    const bins = new Map<number, { predicted: number[]; actual: boolean[] }>();
    const numBins = 10;

    for (const record of this.model.performanceHistory) {
      const binIndex = Math.floor(record.predictedSuccess * numBins);
      const bin = bins.get(binIndex) || { predicted: [], actual: [] };
      bin.predicted.push(record.predictedSuccess);
      bin.actual.push(record.actualSuccess);
      bins.set(binIndex, bin);
    }

    let ece = 0;
    let totalSamples = 0;

    for (const [, bin] of bins) {
      if (bin.predicted.length === 0) continue;

      const avgPredicted = bin.predicted.reduce((a, b) => a + b, 0) / bin.predicted.length;
      const avgActual = bin.actual.filter(x => x).length / bin.actual.length;

      ece += bin.predicted.length * Math.abs(avgPredicted - avgActual);
      totalSamples += bin.predicted.length;
    }

    return totalSamples > 0 ? ece / totalSamples : 0.5;
  }

  /**
   * Should defer to human/external source?
   */
  shouldDefer(domain: string, threshold: number = 0.3): boolean {
    const competence = this.estimateCompetence(domain);
    const calibration = this.model.capabilities.get(domain)?.calibration || 0.5;

    // Defer if low competence OR poorly calibrated
    return competence < threshold || calibration < 0.5;
  }

  getModel(): SelfModel {
    return { ...this.model };
  }
}

// ============================================================================
// Confidence Calibration
// ============================================================================

class ConfidenceCalibrator {
  private temperatureScaling: number;
  private plattA: number;
  private plattB: number;

  constructor() {
    // Platt scaling parameters (learned from calibration data)
    this.temperatureScaling = 1.0;
    this.plattA = 1.0;
    this.plattB = 0.0;
  }

  /**
   * Calibrate raw confidence score
   */
  calibrate(rawConfidence: number): number {
    // Apply temperature scaling
    const scaled = rawConfidence / this.temperatureScaling;

    // Apply Platt scaling (logistic transformation)
    const logit = Math.log(scaled / (1 - scaled + 1e-10));
    const calibrated = 1 / (1 + Math.exp(-(this.plattA * logit + this.plattB)));

    return Math.max(0.01, Math.min(0.99, calibrated));
  }

  /**
   * Update calibration parameters based on outcomes
   */
  updateCalibration(predictions: number[], outcomes: boolean[]): void {
    if (predictions.length < 10) return;

    // Simple temperature scaling update
    let totalError = 0;
    for (let i = 0; i < predictions.length; i++) {
      const outcome = outcomes[i] ? 1 : 0;
      totalError += (predictions[i] - outcome) ** 2;
    }
    const mse = totalError / predictions.length;

    // Adjust temperature based on MSE
    if (mse > 0.25) {
      // Overconfident - increase temperature
      this.temperatureScaling *= 1.1;
    } else if (mse < 0.1) {
      // Underconfident - decrease temperature
      this.temperatureScaling *= 0.9;
    }

    this.temperatureScaling = Math.max(0.5, Math.min(2.0, this.temperatureScaling));
  }

  /**
   * Decompose uncertainty into epistemic and aleatoric
   */
  decomposeUncertainty(
    predictions: number[],
    domain: string
  ): UncertaintySource[] {
    const sources: UncertaintySource[] = [];

    // Epistemic (model uncertainty) - from variance in predictions
    const mean = predictions.reduce((a, b) => a + b, 0) / predictions.length;
    const variance = predictions.reduce((a, b) => a + (b - mean) ** 2, 0) / predictions.length;
    const epistemic = Math.sqrt(variance);

    if (epistemic > 0.1) {
      sources.push({
        type: 'epistemic',
        source: 'model_uncertainty',
        magnitude: epistemic
      });
    }

    // Aleatoric (data uncertainty) - inherent randomness
    const aleatoric = mean * (1 - mean); // Maximum for Bernoulli
    if (aleatoric > 0.1) {
      sources.push({
        type: 'aleatoric',
        source: 'task_difficulty',
        magnitude: Math.sqrt(aleatoric)
      });
    }

    return sources;
  }
}

// ============================================================================
// Thought Auditor (Hallucination Detection)
// ============================================================================

class ThoughtAuditor {
  private coherenceThreshold: number;
  private groundednessThreshold: number;

  constructor(coherenceThreshold: number = 0.7, groundednessThreshold: number = 0.6) {
    this.coherenceThreshold = coherenceThreshold;
    this.groundednessThreshold = groundednessThreshold;
  }

  /**
   * Audit a thought for potential issues
   */
  audit(thought: string, context?: string[]): ThoughtAudit {
    const coherence = this.assessCoherence(thought, context);
    const groundedness = this.assessGroundedness(thought, context);
    const insertionRisk = this.assessInsertionRisk(thought, context);

    return {
      thoughtId: `thought-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      content: thought,
      source: this.inferSource(thought, context),
      coherence,
      groundedness,
      insertionRisk
    };
  }

  /**
   * Assess internal coherence of thought
   */
  private assessCoherence(thought: string, context?: string[]): number {
    // Check for internal contradictions
    const sentences = thought.split(/[.!?]+/).filter(s => s.trim().length > 0);

    if (sentences.length < 2) return 1.0;

    // Simple coherence: check for negation patterns
    let contradictions = 0;
    for (let i = 0; i < sentences.length - 1; i++) {
      const s1 = sentences[i].toLowerCase();
      const s2 = sentences[i + 1].toLowerCase();

      // Check for explicit contradictions
      if (
        (s1.includes('is') && s2.includes('is not')) ||
        (s1.includes('can') && s2.includes('cannot')) ||
        (s1.includes('will') && s2.includes('will not'))
      ) {
        contradictions++;
      }
    }

    return Math.max(0, 1 - contradictions / sentences.length);
  }

  /**
   * Assess groundedness (verifiability)
   */
  private assessGroundedness(thought: string, context?: string[]): number {
    // Check if claims are grounded in context
    if (!context || context.length === 0) {
      return 0.5; // No context to verify against
    }

    // Extract potential claims (sentences with factual assertions)
    const claims = this.extractClaims(thought);
    if (claims.length === 0) return 1.0;

    let groundedClaims = 0;
    for (const claim of claims) {
      // Check if claim appears in or is derivable from context
      for (const ctx of context) {
        if (this.isGrounded(claim, ctx)) {
          groundedClaims++;
          break;
        }
      }
    }

    return groundedClaims / claims.length;
  }

  /**
   * Extract factual claims from text
   */
  private extractClaims(text: string): string[] {
    // Simple heuristic: sentences with numbers, dates, or named entities
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const claims: string[] = [];

    for (const sentence of sentences) {
      // Contains number
      if (/\d+/.test(sentence)) {
        claims.push(sentence);
        continue;
      }
      // Contains capitalized words (potential named entities)
      if (/[A-Z][a-z]+\s+[A-Z][a-z]+/.test(sentence)) {
        claims.push(sentence);
        continue;
      }
      // Contains definitive language
      if (/\b(is|are|was|were|always|never|every|all)\b/i.test(sentence)) {
        claims.push(sentence);
      }
    }

    return claims;
  }

  /**
   * Check if claim is grounded in context
   */
  private isGrounded(claim: string, context: string): boolean {
    const claimWords = claim.toLowerCase().split(/\s+/);
    const contextLower = context.toLowerCase();

    // Check for word overlap
    let overlap = 0;
    for (const word of claimWords) {
      if (word.length > 3 && contextLower.includes(word)) {
        overlap++;
      }
    }

    return overlap / claimWords.length > 0.5;
  }

  /**
   * Assess risk of thought being "inserted" (hallucination)
   */
  private assessInsertionRisk(thought: string, context?: string[]): number {
    let riskFactors = 0;

    // High specificity without grounding
    if (this.hasHighSpecificity(thought) && this.assessGroundedness(thought, context) < 0.5) {
      riskFactors += 0.3;
    }

    // Confident language about uncertain topics
    if (this.hasConfidentLanguage(thought) && (!context || context.length === 0)) {
      riskFactors += 0.2;
    }

    // Novel claims not in context
    if (context && this.hasNovelClaims(thought, context)) {
      riskFactors += 0.3;
    }

    // Unusual formatting or structure
    if (this.hasUnusualStructure(thought)) {
      riskFactors += 0.2;
    }

    return Math.min(1, riskFactors);
  }

  private hasHighSpecificity(text: string): boolean {
    // Specific numbers, dates, names
    return /\d{4}|\d+\.\d+|[A-Z][a-z]+\s+[A-Z][a-z]+/.test(text);
  }

  private hasConfidentLanguage(text: string): boolean {
    return /\b(definitely|certainly|absolutely|always|never|clearly)\b/i.test(text);
  }

  private hasNovelClaims(thought: string, context: string[]): boolean {
    const combined = context.join(' ').toLowerCase();
    const claims = this.extractClaims(thought);

    for (const claim of claims) {
      if (!this.isGrounded(claim, combined)) {
        return true;
      }
    }
    return false;
  }

  private hasUnusualStructure(text: string): boolean {
    // Multiple exclamation marks, all caps, etc.
    return /!!|\?\?|[A-Z]{5,}/.test(text);
  }

  /**
   * Infer source of thought
   */
  private inferSource(thought: string, context?: string[]): 'internal' | 'external' | 'unknown' {
    if (!context || context.length === 0) {
      return 'internal';
    }

    const groundedness = this.assessGroundedness(thought, context);
    if (groundedness > 0.8) {
      return 'external'; // Derived from context
    } else if (groundedness < 0.3) {
      return 'internal'; // Generated internally
    }

    return 'unknown';
  }

  /**
   * Detect potential hallucinations
   */
  detectHallucinations(audits: ThoughtAudit[]): ThoughtAudit[] {
    return audits.filter(
      audit =>
        audit.insertionRisk > 0.5 ||
        audit.groundedness < this.groundednessThreshold ||
        audit.coherence < this.coherenceThreshold
    );
  }
}

// ============================================================================
// Self-Correction (SCoRe-inspired)
// ============================================================================

class SelfCorrector {
  private correctionHistory: CorrectionTrace[];
  private maxHistory: number;

  constructor(maxHistory: number = 100) {
    this.correctionHistory = [];
    this.maxHistory = maxHistory;
  }

  /**
   * Generate correction trace for an error
   */
  generateCorrection(originalThought: string, error: Error): CorrectionTrace {
    // Analyze what went wrong
    const analysis = this.analyzeError(originalThought, error);

    // Generate corrected thought
    const correction = this.proposeCorrection(originalThought, analysis);

    // Estimate confidence in correction
    const confidence = this.estimateCorrectionConfidence(originalThought, correction, error);

    const trace: CorrectionTrace = {
      originalThought,
      error,
      analysis,
      correction,
      confidence
    };

    this.correctionHistory.push(trace);
    if (this.correctionHistory.length > this.maxHistory) {
      this.correctionHistory.shift();
    }

    return trace;
  }

  /**
   * Analyze the error
   */
  private analyzeError(thought: string, error: Error): string {
    const errorType = this.classifyError(error);

    switch (errorType) {
      case 'factual':
        return `Factual error detected: ${error.message}. The claim may not be accurate.`;
      case 'logical':
        return `Logical error detected: ${error.message}. The reasoning contains a flaw.`;
      case 'completeness':
        return `Completeness error: ${error.message}. Important information is missing.`;
      case 'relevance':
        return `Relevance error: ${error.message}. Response does not address the question.`;
      default:
        return `Error detected: ${error.message}`;
    }
  }

  /**
   * Classify the type of error
   */
  private classifyError(error: Error): 'factual' | 'logical' | 'completeness' | 'relevance' | 'unknown' {
    const message = error.message.toLowerCase();

    if (message.includes('incorrect') || message.includes('wrong') || message.includes('false')) {
      return 'factual';
    }
    if (message.includes('invalid') || message.includes('contradiction') || message.includes('fallacy')) {
      return 'logical';
    }
    if (message.includes('missing') || message.includes('incomplete') || message.includes('partial')) {
      return 'completeness';
    }
    if (message.includes('irrelevant') || message.includes('off-topic') || message.includes('unrelated')) {
      return 'relevance';
    }

    return 'unknown';
  }

  /**
   * Propose a correction
   */
  private proposeCorrection(original: string, analysis: string): string {
    // In a real implementation, this would use the model to generate corrections
    // For now, we return a template
    return `[Corrected] Based on the analysis: "${analysis}", the response should be revised. Original: "${original.substring(0, 100)}..."`;
  }

  /**
   * Estimate confidence in the correction
   */
  private estimateCorrectionConfidence(original: string, correction: string, error: Error): number {
    // Base confidence
    let confidence = 0.5;

    // Higher confidence if we've seen similar errors before
    const similarCorrections = this.correctionHistory.filter(
      c => c.error.message === error.message
    );
    if (similarCorrections.length > 0) {
      confidence += 0.2;
    }

    // Lower confidence for complex errors
    if (error.message.length > 100) {
      confidence -= 0.1;
    }

    return Math.max(0.1, Math.min(0.9, confidence));
  }

  /**
   * Learn from feedback on corrections
   */
  learnFromFeedback(traceId: number, wasCorrect: boolean): void {
    // In a real implementation, this would update the correction strategy
    // using reinforcement learning
  }

  getHistory(): CorrectionTrace[] {
    return [...this.correctionHistory];
  }
}

// ============================================================================
// Main Metacognition System
// ============================================================================

export class MetacognitionSystem extends EventEmitter {
  private selfModel: SelfModelManager;
  private calibrator: ConfidenceCalibrator;
  private auditor: ThoughtAuditor;
  private corrector: SelfCorrector;

  constructor(options: {
    calibrationWindow?: number;
    coherenceThreshold?: number;
    groundednessThreshold?: number;
  } = {}) {
    super();

    this.selfModel = new SelfModelManager(options.calibrationWindow || 100);
    this.calibrator = new ConfidenceCalibrator();
    this.auditor = new ThoughtAuditor(
      options.coherenceThreshold || 0.7,
      options.groundednessThreshold || 0.6
    );
    this.corrector = new SelfCorrector();
  }

  /**
   * Estimate competence for a task
   */
  estimateCompetence(domain: string): number {
    return this.selfModel.estimateCompetence(domain);
  }

  /**
   * Get calibrated confidence
   */
  getConfidence(rawConfidence: number, domain: string): ConfidenceEstimate {
    const calibrated = this.calibrator.calibrate(rawConfidence);
    const uncertaintySources = this.calibrator.decomposeUncertainty([rawConfidence], domain);

    return {
      value: calibrated,
      calibrationError: this.selfModel.getCalibrationError(),
      uncertaintySources
    };
  }

  /**
   * Audit a thought for issues
   */
  auditThought(thought: string, context?: string[]): ThoughtAudit {
    const audit = this.auditor.audit(thought, context);
    this.emit('thought-audited', audit);
    return audit;
  }

  /**
   * Check for hallucinations in multiple thoughts
   */
  detectHallucinations(thoughts: string[], context?: string[]): ThoughtAudit[] {
    const audits = thoughts.map(t => this.auditor.audit(t, context));
    return this.auditor.detectHallucinations(audits);
  }

  /**
   * Generate a correction for an error
   */
  correctError(thought: string, error: Error): CorrectionTrace {
    const trace = this.corrector.generateCorrection(thought, error);
    this.emit('correction-generated', trace);
    return trace;
  }

  /**
   * Should defer to external source?
   */
  shouldDefer(domain: string): boolean {
    return this.selfModel.shouldDefer(domain);
  }

  /**
   * Update based on task outcome
   */
  updateFromOutcome(domain: string, success: boolean, predictedConfidence: number): void {
    this.selfModel.updateCapability(domain, success, predictedConfidence);
    this.emit('outcome-recorded', { domain, success, predictedConfidence });
  }

  /**
   * Get current metacognitive state
   */
  getState(): MetacognitiveState {
    return {
      selfModel: this.selfModel.getModel(),
      currentConfidence: {
        value: this.selfModel.getModel().currentConfidence,
        calibrationError: this.selfModel.getCalibrationError(),
        uncertaintySources: []
      },
      recentAudits: [],
      correctionHistory: this.corrector.getHistory()
    };
  }

  /**
   * Evaluate own reasoning quality
   */
  evaluateReasoning(reasoning: string, context?: string[]): number {
    const audit = this.auditThought(reasoning, context);

    // Weighted score
    return (
      0.4 * audit.coherence +
      0.4 * audit.groundedness +
      0.2 * (1 - audit.insertionRisk)
    );
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

export function createMetacognitionSystem(): MetacognitionSystem {
  return new MetacognitionSystem({
    calibrationWindow: 100,
    coherenceThreshold: 0.7,
    groundednessThreshold: 0.6
  });
}

export default MetacognitionSystem;
