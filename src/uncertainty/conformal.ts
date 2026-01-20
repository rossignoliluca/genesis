/**
 * Genesis v9.0 - Conformal Prediction Module
 *
 * Implements distribution-free uncertainty quantification using conformal prediction.
 * Provides statistically valid prediction intervals with guaranteed coverage.
 *
 * Key Properties:
 * - Distribution-free: No assumptions about data distribution
 * - Finite-sample valid: Coverage guarantees hold for any sample size
 * - Model-agnostic: Works with any prediction model
 *
 * References:
 * - Vovk et al. (2005) "Algorithmic Learning in a Random World"
 * - Angelopoulos & Bates (2021) "A Gentle Introduction to Conformal Prediction"
 */

import { EventEmitter } from 'events';

// ============================================================================
// Types
// ============================================================================

export interface CalibrationPoint {
  input: unknown;
  prediction: number;
  actual: number;
  nonconformityScore: number;
  timestamp: number;
}

export interface PredictionInterval {
  lower: number;
  upper: number;
  center: number;
  width: number;
  coverage: number;
  confidence: number;
}

export interface SetPrediction {
  values: unknown[];
  probabilities: number[];
  confidence: number;
}

export interface ConformalConfig {
  /** Target coverage (1 - alpha), e.g., 0.9 for 90% coverage */
  coverageTarget: number;
  /** Minimum calibration samples */
  minCalibrationSize: number;
  /** Maximum calibration samples (sliding window) */
  maxCalibrationSize: number;
  /** Adaptive recalibration interval */
  recalibrationInterval: number;
  /** Enable verbose logging */
  verbose: boolean;
}

export interface CoverageStats {
  empiricalCoverage: number;
  targetCoverage: number;
  calibrationSetSize: number;
  averageIntervalWidth: number;
  isCoverageValid: boolean;
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: ConformalConfig = {
  coverageTarget: 0.9, // 90% coverage
  minCalibrationSize: 10,
  maxCalibrationSize: 1000,
  recalibrationInterval: 100,
  verbose: false,
};

// ============================================================================
// Nonconformity Measures
// ============================================================================

export type NonconformityMeasure = (
  prediction: number,
  actual: number,
  context?: unknown
) => number;

/** Absolute residual (default for regression) */
export const absoluteResidual: NonconformityMeasure = (pred, actual) =>
  Math.abs(pred - actual);

/** Normalized residual (for heteroscedastic data) */
export const normalizedResidual = (sigma: number): NonconformityMeasure =>
  (pred, actual) => Math.abs(pred - actual) / Math.max(sigma, 0.001);

/** Signed residual (for asymmetric coverage) */
export const signedResidual: NonconformityMeasure = (pred, actual) =>
  actual - pred;

/** Quantile-based for quantile regression */
export const quantileResidual = (quantile: number): NonconformityMeasure =>
  (pred, actual) => {
    const residual = actual - pred;
    return residual >= 0 ? quantile * residual : (quantile - 1) * residual;
  };

// ============================================================================
// Conformal Predictor (Split Conformal)
// ============================================================================

export class ConformalPredictor extends EventEmitter {
  private config: ConformalConfig;
  private calibrationSet: CalibrationPoint[] = [];
  private nonconformityMeasure: NonconformityMeasure;
  private predictionCount = 0;
  private coveredCount = 0;

  constructor(
    config: Partial<ConformalConfig> = {},
    nonconformityMeasure: NonconformityMeasure = absoluteResidual
  ) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.nonconformityMeasure = nonconformityMeasure;
  }

  /**
   * Add a calibration point (prediction with known outcome)
   */
  calibrate(input: unknown, prediction: number, actual: number): void {
    const score = this.nonconformityMeasure(prediction, actual);

    const point: CalibrationPoint = {
      input,
      prediction,
      actual,
      nonconformityScore: score,
      timestamp: Date.now(),
    };

    this.calibrationSet.push(point);

    // Maintain sliding window
    if (this.calibrationSet.length > this.config.maxCalibrationSize) {
      this.calibrationSet.shift();
    }

    // Track coverage
    if (this.predictionCount > 0) {
      this.emit('calibration-updated', {
        size: this.calibrationSet.length,
        score,
      });
    }

    this.log(`Calibration point added, set size: ${this.calibrationSet.length}`);
  }

  /**
   * Get prediction interval for a new prediction
   */
  predict(prediction: number): PredictionInterval {
    if (this.calibrationSet.length < this.config.minCalibrationSize) {
      this.log(`Insufficient calibration data: ${this.calibrationSet.length}`);
      // Return wide interval as fallback
      const fallbackWidth = 10;
      return {
        lower: prediction - fallbackWidth,
        upper: prediction + fallbackWidth,
        center: prediction,
        width: fallbackWidth * 2,
        coverage: 0.5, // Unknown
        confidence: 0,
      };
    }

    // Compute quantile from calibration scores
    const alpha = 1 - this.config.coverageTarget;
    const quantileIndex = Math.ceil(
      (this.calibrationSet.length + 1) * (1 - alpha)
    ) - 1;

    // Sort nonconformity scores
    const scores = this.calibrationSet
      .map(p => p.nonconformityScore)
      .sort((a, b) => a - b);

    // Get quantile value (this is the radius of the interval)
    const radius = scores[Math.min(quantileIndex, scores.length - 1)];

    const interval: PredictionInterval = {
      lower: prediction - radius,
      upper: prediction + radius,
      center: prediction,
      width: radius * 2,
      coverage: this.config.coverageTarget,
      confidence: Math.min(this.calibrationSet.length / this.config.minCalibrationSize, 1),
    };

    this.predictionCount++;
    this.emit('prediction', interval);

    return interval;
  }

  /**
   * Update coverage tracking with actual outcome
   */
  updateCoverage(interval: PredictionInterval, actual: number): boolean {
    const covered = actual >= interval.lower && actual <= interval.upper;

    if (covered) {
      this.coveredCount++;
    }

    // Recalibrate if needed
    if (this.predictionCount % this.config.recalibrationInterval === 0) {
      this.checkCoverageValidity();
    }

    return covered;
  }

  /**
   * Check if empirical coverage matches target
   */
  private checkCoverageValidity(): void {
    const empiricalCoverage = this.predictionCount > 0
      ? this.coveredCount / this.predictionCount
      : 0;

    const gap = Math.abs(empiricalCoverage - this.config.coverageTarget);

    if (gap > 0.05) { // More than 5% deviation
      this.log(`Coverage drift detected: ${empiricalCoverage.toFixed(3)} vs target ${this.config.coverageTarget}`);
      this.emit('coverage-drift', {
        empirical: empiricalCoverage,
        target: this.config.coverageTarget,
        gap,
      });
    }
  }

  /**
   * Get current coverage statistics
   */
  getStats(): CoverageStats {
    const empiricalCoverage = this.predictionCount > 0
      ? this.coveredCount / this.predictionCount
      : 0;

    const avgWidth = this.calibrationSet.length > 0
      ? this.calibrationSet.reduce((sum, p) => sum + p.nonconformityScore, 0) /
        this.calibrationSet.length * 2
      : 0;

    return {
      empiricalCoverage,
      targetCoverage: this.config.coverageTarget,
      calibrationSetSize: this.calibrationSet.length,
      averageIntervalWidth: avgWidth,
      isCoverageValid: Math.abs(empiricalCoverage - this.config.coverageTarget) <= 0.05,
    };
  }

  /**
   * Reset calibration data
   */
  reset(): void {
    this.calibrationSet = [];
    this.predictionCount = 0;
    this.coveredCount = 0;
  }

  /**
   * Log message if verbose
   */
  private log(...args: unknown[]): void {
    if (this.config.verbose) {
      console.log('[Conformal]', ...args);
    }
  }
}

// ============================================================================
// Conformal Classifier (Set Prediction)
// ============================================================================

export class ConformalClassifier extends EventEmitter {
  private config: ConformalConfig;
  private calibrationScores: Map<string, number[]> = new Map();
  private classLabels: string[] = [];

  constructor(config: Partial<ConformalConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Add calibration point for classification
   */
  calibrate(
    input: unknown,
    classProbabilities: Record<string, number>,
    trueClass: string
  ): void {
    // Nonconformity score = 1 - P(true class)
    const score = 1 - (classProbabilities[trueClass] || 0);

    if (!this.calibrationScores.has(trueClass)) {
      this.calibrationScores.set(trueClass, []);
      this.classLabels.push(trueClass);
    }

    const scores = this.calibrationScores.get(trueClass)!;
    scores.push(score);

    // Maintain window
    if (scores.length > this.config.maxCalibrationSize) {
      scores.shift();
    }
  }

  /**
   * Get prediction set with coverage guarantee
   */
  predict(classProbabilities: Record<string, number>): SetPrediction {
    const alpha = 1 - this.config.coverageTarget;

    // Compute global quantile threshold
    const allScores: number[] = [];
    for (const scores of this.calibrationScores.values()) {
      allScores.push(...scores);
    }

    if (allScores.length < this.config.minCalibrationSize) {
      // Return all classes
      return {
        values: Object.keys(classProbabilities),
        probabilities: Object.values(classProbabilities),
        confidence: 0,
      };
    }

    allScores.sort((a, b) => a - b);
    const quantileIndex = Math.ceil((allScores.length + 1) * (1 - alpha)) - 1;
    const threshold = 1 - allScores[Math.min(quantileIndex, allScores.length - 1)];

    // Include classes with probability >= threshold
    const predictionSet: string[] = [];
    const probabilities: number[] = [];

    for (const [className, prob] of Object.entries(classProbabilities)) {
      if (prob >= threshold) {
        predictionSet.push(className);
        probabilities.push(prob);
      }
    }

    // Ensure at least one class
    if (predictionSet.length === 0) {
      const best = Object.entries(classProbabilities)
        .sort(([, a], [, b]) => b - a)[0];
      predictionSet.push(best[0]);
      probabilities.push(best[1]);
    }

    return {
      values: predictionSet,
      probabilities,
      confidence: Math.min(allScores.length / this.config.minCalibrationSize, 1),
    };
  }

  /**
   * Get statistics
   */
  getStats(): {
    classes: number;
    totalCalibrationPoints: number;
    averageSetSize: number;
  } {
    let total = 0;
    for (const scores of this.calibrationScores.values()) {
      total += scores.length;
    }

    return {
      classes: this.classLabels.length,
      totalCalibrationPoints: total,
      averageSetSize: this.classLabels.length, // Would need tracking
    };
  }
}

// ============================================================================
// Adaptive Conformal Inference (for non-exchangeable data)
// ============================================================================

export class AdaptiveConformalPredictor {
  private config: ConformalConfig;
  private errHistory: boolean[] = [];
  private alphaHistory: number[] = [];
  private gamma = 0.005; // Learning rate

  constructor(config: Partial<ConformalConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.alphaHistory.push(1 - this.config.coverageTarget);
  }

  /**
   * Adapt alpha based on coverage performance (ACI algorithm)
   */
  adapt(wasCovered: boolean): number {
    const alpha = 1 - this.config.coverageTarget;

    this.errHistory.push(!wasCovered);

    // ACI update: alpha_t+1 = alpha_t + gamma * (err_t - alpha)
    const currentAlpha = this.alphaHistory[this.alphaHistory.length - 1];
    const error = wasCovered ? 0 : 1;
    const newAlpha = Math.max(0.01, Math.min(0.5,
      currentAlpha + this.gamma * (error - alpha)
    ));

    this.alphaHistory.push(newAlpha);

    return newAlpha;
  }

  /**
   * Get current adapted alpha value
   */
  getCurrentAlpha(): number {
    return this.alphaHistory[this.alphaHistory.length - 1];
  }

  /**
   * Get current adapted coverage target
   */
  getCurrentCoverage(): number {
    return 1 - this.getCurrentAlpha();
  }

  /**
   * Get empirical coverage over window
   */
  getEmpiricalCoverage(windowSize: number = 100): number {
    const window = this.errHistory.slice(-windowSize);
    if (window.length === 0) return 0;

    const errors = window.filter(e => e).length;
    return 1 - errors / window.length;
  }
}

// ============================================================================
// Quantile Regression Conformal
// ============================================================================

export class QuantileConformalPredictor {
  private lowerQuantile: number;
  private upperQuantile: number;
  private calibrationResiduals: Array<{ lower: number; upper: number }> = [];
  private config: ConformalConfig;

  constructor(
    lowerQuantile: number = 0.05,
    upperQuantile: number = 0.95,
    config: Partial<ConformalConfig> = {}
  ) {
    this.lowerQuantile = lowerQuantile;
    this.upperQuantile = upperQuantile;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Calibrate with quantile predictions
   */
  calibrate(
    lowerPred: number,
    upperPred: number,
    actual: number
  ): void {
    // Conformity score E_i = max(q_lo - Y, Y - q_hi)
    const residual = {
      lower: lowerPred - actual,  // Positive if prediction too high
      upper: actual - upperPred,   // Positive if prediction too low
    };

    this.calibrationResiduals.push(residual);

    if (this.calibrationResiduals.length > this.config.maxCalibrationSize) {
      this.calibrationResiduals.shift();
    }
  }

  /**
   * Get conformalized quantile interval
   */
  predict(lowerPred: number, upperPred: number): PredictionInterval {
    if (this.calibrationResiduals.length < this.config.minCalibrationSize) {
      return {
        lower: lowerPred,
        upper: upperPred,
        center: (lowerPred + upperPred) / 2,
        width: upperPred - lowerPred,
        coverage: this.config.coverageTarget,
        confidence: 0,
      };
    }

    // Compute max scores
    const maxScores = this.calibrationResiduals.map(r =>
      Math.max(r.lower, r.upper)
    ).sort((a, b) => a - b);

    // Get quantile correction
    const alpha = 1 - this.config.coverageTarget;
    const index = Math.ceil((maxScores.length + 1) * (1 - alpha)) - 1;
    const correction = maxScores[Math.min(index, maxScores.length - 1)];

    return {
      lower: lowerPred - correction,
      upper: upperPred + correction,
      center: (lowerPred + upperPred) / 2,
      width: (upperPred - lowerPred) + 2 * correction,
      coverage: this.config.coverageTarget,
      confidence: Math.min(this.calibrationResiduals.length / this.config.minCalibrationSize, 1),
    };
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a conformal predictor for LLM response confidence
 */
export function createLLMConformalPredictor(): ConformalPredictor {
  return new ConformalPredictor({
    coverageTarget: 0.85, // 85% coverage for LLM
    minCalibrationSize: 20,
    maxCalibrationSize: 500,
    verbose: false,
  });
}

/**
 * Create a conformal predictor for Active Inference free energy
 */
export function createFreeEnergyConformalPredictor(): ConformalPredictor {
  return new ConformalPredictor({
    coverageTarget: 0.9,
    minCalibrationSize: 30,
    maxCalibrationSize: 200,
  }, normalizedResidual(0.1)); // Normalized by typical FE scale
}

/**
 * Create an adaptive conformal predictor for non-stationary data
 */
export function createAdaptiveConformal(
  coverageTarget: number = 0.9
): AdaptiveConformalPredictor {
  return new AdaptiveConformalPredictor({ coverageTarget });
}

// ============================================================================
// Exports
// ============================================================================

export default ConformalPredictor;
