/**
 * Allostasis Module - Predictive Regulation for Autonomous Agents
 *
 * Implements allostatic control (stability through change):
 * - Interoception: Sensing internal state (energy, load, health)
 * - Anticipatory regulation: Act BEFORE deficits occur
 * - Active Inference: Minimize Expected Free Energy
 * - Homeostatic setpoints that adapt to context
 *
 * Unlike homeostasis (reactive), allostasis is predictive:
 * "Prepare for the tiger before you see it"
 */

import { EventEmitter } from 'events';

// ============================================================================
// Types
// ============================================================================

export interface InteroceptiveState {
  energy: number;              // 0-1 (computational budget remaining)
  computationalLoad: number;   // 0-1 (current CPU/memory usage)
  thermalState: number;        // 0-1 (risk of throttling)
  errorRate: number;           // Recent error frequency
  latency: number;             // Response time degradation
  memoryPressure: number;      // 0-1 (memory usage)
  queueDepth: number;          // Pending tasks
  timestamp: number;
}

export interface AllostaticSetpoint {
  variable: keyof InteroceptiveState;
  target: number;
  tolerance: number;           // Acceptable deviation
  priority: number;            // How important to maintain
  adaptive: boolean;           // Can setpoint change?
}

export interface FutureNeed {
  resource: string;
  amount: number;
  timeHorizon: number;         // When needed (ms from now)
  confidence: number;          // How certain we are
  source: string;              // What predicted this need
}

export interface AllostaticAction {
  type: AllostaticActionType;
  target: string;
  magnitude: number;
  urgency: number;
  reason: string;
}

export type AllostaticActionType =
  | 'throttle'                 // Reduce processing rate
  | 'scale_up'                 // Request more resources
  | 'scale_down'               // Release resources
  | 'defer'                    // Delay non-critical tasks
  | 'preload'                  // Anticipatory loading
  | 'hibernate'                // Enter low-power state
  | 'alert'                    // Signal for intervention
  | 'adapt_setpoint';          // Change target

export interface AllostaticPrediction {
  state: Partial<InteroceptiveState>;
  timestamp: number;
  confidence: number;
  basedOn: string[];
}

export interface RegulationResult {
  action: AllostaticAction;
  predictedEffect: Partial<InteroceptiveState>;
  actualEffect?: Partial<InteroceptiveState>;
  success: boolean;
}

export interface EFEComponents {
  pragmaticValue: number;      // Goal achievement
  epistemicValue: number;      // Information gain
  ambiguity: number;           // Expected uncertainty
  risk: number;                // Variance of outcomes
}

export interface AllostasisMetrics {
  regulationCount: number;
  successRate: number;
  averageAnticipation: number; // How far ahead we act
  setpointDeviations: Map<string, number>;
  actionDistribution: Map<AllostaticActionType, number>;
}

// ============================================================================
// Type-Safe State Access (v10.0)
// ============================================================================

/** Valid state variable keys */
type StateKey = keyof InteroceptiveState;

/** Type-safe state variable getter */
function getStateValue(state: InteroceptiveState, key: string): number | undefined {
  if (key in state && key !== 'timestamp') {
    return state[key as StateKey] as number;
  }
  return undefined;
}

/** Type-safe state variable setter */
function setStateValue(state: InteroceptiveState, key: string, value: number): void {
  if (key in state && key !== 'timestamp') {
    (state as unknown as Record<string, number>)[key] = value;
  }
}

/** Type-safe partial state setter */
function setPartialStateValue(state: Partial<InteroceptiveState>, key: string, value: number): void {
  if (key !== 'timestamp') {
    (state as unknown as Record<string, number>)[key] = value;
  }
}

// ============================================================================
// Interoception (Internal State Sensing)
// ============================================================================

class InteroceptionSystem {
  private currentState: InteroceptiveState;
  private stateHistory: InteroceptiveState[];
  private maxHistory: number;
  private sensorCallbacks: Map<string, () => number>;

  constructor(maxHistory: number = 100) {
    this.maxHistory = maxHistory;
    this.stateHistory = [];
    this.sensorCallbacks = new Map();

    // Initialize with neutral state
    this.currentState = {
      energy: 1.0,
      computationalLoad: 0.0,
      thermalState: 0.0,
      errorRate: 0.0,
      latency: 0.0,
      memoryPressure: 0.0,
      queueDepth: 0,
      timestamp: Date.now()
    };
  }

  /**
   * Register a sensor callback for a state variable
   */
  registerSensor(variable: keyof InteroceptiveState, callback: () => number): void {
    this.sensorCallbacks.set(variable, callback);
    if (this.sensorCallbacks.size > 200) {
      const keys = Array.from(this.sensorCallbacks.keys());
      for (let i = 0; i < 50; i++) this.sensorCallbacks.delete(keys[i]);
    }
    if (this.sensorCallbacks.size > 200) {
      const keys = Array.from(this.sensorCallbacks.keys());
      for (let i = 0; i < 50; i++) this.sensorCallbacks.delete(keys[i]);
    }
    if (this.sensorCallbacks.size > 200) {
      const keys = Array.from(this.sensorCallbacks.keys());
      for (let i = 0; i < 50; i++) this.sensorCallbacks.delete(keys[i]);
    }
    if (this.sensorCallbacks.size > 200) {
      const keys = Array.from(this.sensorCallbacks.keys());
      for (let i = 0; i < 50; i++) this.sensorCallbacks.delete(keys[i]);
    }
    if (this.sensorCallbacks.size > 200) {
      const keys = Array.from(this.sensorCallbacks.keys());
      for (let i = 0; i < 50; i++) this.sensorCallbacks.delete(keys[i]);
    }
    if (this.sensorCallbacks.size > 200) {
      const keys = Array.from(this.sensorCallbacks.keys());
      for (let i = 0; i < 50; i++) this.sensorCallbacks.delete(keys[i]);
    }
    if (this.sensorCallbacks.size > 200) {
      const keys = Array.from(this.sensorCallbacks.keys());
      for (let i = 0; i < 50; i++) this.sensorCallbacks.delete(keys[i]);
    }
    if (this.sensorCallbacks.size > 200) {
      const keys = Array.from(this.sensorCallbacks.keys());
      for (let i = 0; i < 50; i++) this.sensorCallbacks.delete(keys[i]);
    }
    if (this.sensorCallbacks.size > 50) {
      const keys = Array.from(this.sensorCallbacks.keys());
      for (let i = 0; i < 10; i++) this.sensorCallbacks.delete(keys[i]);
    }
  }

  /**
   * Sense current internal state
   */
  sense(): InteroceptiveState {
    const newState: InteroceptiveState = {
      ...this.currentState,
      timestamp: Date.now()
    };

    // Update from registered sensors
    for (const [variable, callback] of this.sensorCallbacks) {
      try {
        setStateValue(newState, variable, callback());
      } catch {
        // Sensor failed, keep previous value
      }
    }

    // Default sensors if not registered
    if (!this.sensorCallbacks.has('memoryPressure')) {
      newState.memoryPressure = this.estimateMemoryPressure();
    }

    if (!this.sensorCallbacks.has('computationalLoad')) {
      newState.computationalLoad = this.estimateComputationalLoad();
    }

    // Update current state and history
    this.currentState = newState;
    this.stateHistory.push(newState);

    if (this.stateHistory.length > this.maxHistory) {
      this.stateHistory.shift();
    }

    return newState;
  }

  /**
   * Estimate memory pressure from process stats
   */
  private estimateMemoryPressure(): number {
    // In Node.js, we can check process memory
    try {
      const used = process.memoryUsage();
      const heapUsed = used.heapUsed / used.heapTotal;
      return Math.min(1, heapUsed);
    } catch {
      return this.currentState.memoryPressure;
    }
  }

  /**
   * Estimate computational load
   */
  private estimateComputationalLoad(): number {
    // Use event loop lag as proxy
    const historyWindow = this.stateHistory.slice(-10);
    if (historyWindow.length < 2) return 0;

    // Check if timestamps are increasing linearly (low load)
    // or have gaps (high load)
    let totalLag = 0;
    for (let i = 1; i < historyWindow.length; i++) {
      const expected = 100; // Expected interval
      const actual = historyWindow[i].timestamp - historyWindow[i - 1].timestamp;
      totalLag += Math.max(0, actual - expected);
    }

    const avgLag = totalLag / (historyWindow.length - 1);
    return Math.min(1, avgLag / 1000); // Normalize to 0-1
  }

  /**
   * Get current state
   */
  getState(): InteroceptiveState {
    return { ...this.currentState };
  }

  /**
   * Get state history
   */
  getHistory(): InteroceptiveState[] {
    return [...this.stateHistory];
  }

  /**
   * Get rate of change for a variable
   */
  getDerivative(variable: keyof InteroceptiveState): number {
    const history = this.stateHistory.slice(-5);
    if (history.length < 2) return 0;

    const values = history.map(s => s[variable] as number);
    const times = history.map(s => s.timestamp);

    // Linear regression slope
    const n = values.length;
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
    for (let i = 0; i < n; i++) {
      const x = times[i] - times[0];
      sumX += x;
      sumY += values[i];
      sumXY += x * values[i];
      sumX2 += x * x;
    }

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX + 1e-10);
    return slope * 1000; // Rate per second
  }

  /**
   * Detect anomalies in current state
   */
  detectAnomalies(): Array<{ variable: string; deviation: number }> {
    const anomalies: Array<{ variable: string; deviation: number }> = [];
    const history = this.stateHistory.slice(-20);

    if (history.length < 10) return anomalies;

    const variables: (keyof InteroceptiveState)[] = [
      'energy', 'computationalLoad', 'thermalState',
      'errorRate', 'latency', 'memoryPressure'
    ];

    for (const variable of variables) {
      const values = history.map(s => s[variable] as number);
      const mean = values.reduce((a, b) => a + b, 0) / values.length;
      const std = Math.sqrt(
        values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length
      );

      const current = this.currentState[variable] as number;
      const zScore = (current - mean) / (std + 1e-10);

      if (Math.abs(zScore) > 2) {
        anomalies.push({ variable, deviation: zScore });
      }
    }

    return anomalies;
  }
}

// ============================================================================
// Anticipatory Model
// ============================================================================

class AnticipatoryModel {
  private predictionHorizon: number;
  private modelWeights: Map<string, number[]>;
  private predictionHistory: AllostaticPrediction[];

  constructor(predictionHorizon: number = 10000) { // 10 seconds
    this.predictionHorizon = predictionHorizon;
    this.modelWeights = new Map();
    this.predictionHistory = [];
  }

  /**
   * Predict future state
   */
  predict(
    currentState: InteroceptiveState,
    history: InteroceptiveState[],
    horizon: number = this.predictionHorizon
  ): AllostaticPrediction[] {
    const predictions: AllostaticPrediction[] = [];
    const steps = Math.ceil(horizon / 1000); // 1 second steps

    let predictedState = { ...currentState };

    for (let step = 1; step <= steps; step++) {
      const timestamp = currentState.timestamp + step * 1000;

      // Predict each variable
      predictedState = {
        ...predictedState,
        energy: this.predictVariable('energy', history, step),
        computationalLoad: this.predictVariable('computationalLoad', history, step),
        thermalState: this.predictVariable('thermalState', history, step),
        errorRate: this.predictVariable('errorRate', history, step),
        latency: this.predictVariable('latency', history, step),
        memoryPressure: this.predictVariable('memoryPressure', history, step),
        queueDepth: Math.max(0, currentState.queueDepth - step * 0.1),
        timestamp
      };

      predictions.push({
        state: predictedState,
        timestamp,
        confidence: Math.max(0.3, 1 - step * 0.05), // Confidence decreases with horizon
        basedOn: ['trend_extrapolation', 'historical_patterns']
      });
    }

    // Store predictions for later validation
    this.predictionHistory.push(...predictions.slice(0, 3));
    if (this.predictionHistory.length > 100) {
      this.predictionHistory = this.predictionHistory.slice(-100);
    }

    return predictions;
  }

  /**
   * Predict a single variable
   */
  private predictVariable(
    variable: string,
    history: InteroceptiveState[],
    stepsAhead: number
  ): number {
    if (history.length < 3) {
      return getStateValue(history[history.length - 1], variable) ?? 0.5;
    }

    // Use exponential smoothing with trend
    const values = history.slice(-10).map(s => getStateValue(s, variable) ?? 0);

    // Simple trend extrapolation
    const n = values.length;
    const trend = (values[n - 1] - values[0]) / n;
    const predicted = values[n - 1] + trend * stepsAhead;

    // Clamp to valid range
    return Math.max(0, Math.min(1, predicted));
  }

  /**
   * Predict future needs based on state trajectory
   */
  predictNeeds(
    currentState: InteroceptiveState,
    history: InteroceptiveState[],
    setpoints: AllostaticSetpoint[]
  ): FutureNeed[] {
    const needs: FutureNeed[] = [];
    const predictions = this.predict(currentState, history);

    for (const setpoint of setpoints) {
      // Find when we'll breach the setpoint
      for (let i = 0; i < predictions.length; i++) {
        const predicted = predictions[i].state[setpoint.variable];
        if (predicted === undefined) continue;

        const deviation = Math.abs(predicted - setpoint.target);
        if (deviation > setpoint.tolerance) {
          // We'll need to regulate this
          const timeHorizon = (i + 1) * 1000;
          const amount = deviation - setpoint.tolerance;

          needs.push({
            resource: setpoint.variable,
            amount,
            timeHorizon,
            confidence: predictions[i].confidence,
            source: 'anticipatory_model'
          });

          break; // Only report first breach
        }
      }
    }

    return needs;
  }

  /**
   * Update model based on prediction accuracy
   */
  updateModel(actual: InteroceptiveState): void {
    // Find predictions that were for this timestamp
    const relevantPredictions = this.predictionHistory.filter(
      p => Math.abs(p.timestamp - actual.timestamp) < 500
    );

    if (relevantPredictions.length === 0) return;

    // Calculate prediction errors and update weights
    // (Simplified - full implementation would use gradient descent)
    for (const prediction of relevantPredictions) {
      for (const [variable, predictedValue] of Object.entries(prediction.state)) {
        if (variable === 'timestamp') continue;
        const actualValue = getStateValue(actual, variable);
        if (actualValue !== undefined && predictedValue !== undefined) {
          const error = Math.abs(predictedValue as number - actualValue);
          // Store error for model improvement
        }
      }
    }
  }
}

// ============================================================================
// Active Inference Controller
// ============================================================================

class ActiveInferenceController {
  private preferredStates: Map<string, number>;
  private precisionWeights: Map<string, number>;

  constructor() {
    this.preferredStates = new Map();
    this.precisionWeights = new Map();
  }

  /**
   * Set preferred state for a variable
   */
  setPreference(variable: string, value: number, precision: number = 1.0): void {
    this.preferredStates.set(variable, value);
    this.precisionWeights.set(variable, precision);
    
    // Cap unbounded collections
    if (this.preferredStates.size > 500) {
      const keys = Array.from(this.preferredStates.keys());
      for (let i = 0; i < 100; i++) {
        this.preferredStates.delete(keys[i]);
        this.precisionWeights.delete(keys[i]);
      }
    }
  }

  /**
   * Calculate Expected Free Energy for an action
   */
  calculateEFE(
    action: AllostaticAction,
    currentState: InteroceptiveState,
    predictions: AllostaticPrediction[]
  ): EFEComponents {
    // Pragmatic value: Does action move us toward preferred states?
    const pragmaticValue = this.calculatePragmaticValue(action, currentState);

    // Epistemic value: Does action reduce uncertainty?
    const epistemicValue = this.calculateEpistemicValue(action, predictions);

    // Ambiguity: Expected uncertainty about outcomes
    const ambiguity = this.calculateAmbiguity(action, predictions);

    // Risk: Variance of expected outcomes
    const risk = this.calculateRisk(action, predictions);

    return {
      pragmaticValue,
      epistemicValue,
      ambiguity,
      risk
    };
  }

  /**
   * Calculate pragmatic value (goal achievement)
   */
  private calculatePragmaticValue(
    action: AllostaticAction,
    currentState: InteroceptiveState
  ): number {
    let value = 0;

    for (const [variable, preferred] of this.preferredStates) {
      const current = getStateValue(currentState, variable);
      if (current === undefined) continue;

      const precision = this.precisionWeights.get(variable) || 1.0;
      const currentError = (current - preferred) ** 2;

      // Estimate post-action state
      const postAction = this.estimatePostAction(action, variable, current);
      const postError = (postAction - preferred) ** 2;

      // Value is reduction in error, weighted by precision
      value += precision * (currentError - postError);
    }

    return value;
  }

  /**
   * Estimate state after action
   */
  private estimatePostAction(
    action: AllostaticAction,
    variable: string,
    currentValue: number
  ): number {
    // Simple linear model of action effects
    const effects: Record<AllostaticActionType, Record<string, number>> = {
      'throttle': { computationalLoad: -0.2, latency: 0.1, energy: 0.1 },
      'scale_up': { computationalLoad: -0.3, memoryPressure: -0.2 },
      'scale_down': { energy: 0.2, memoryPressure: -0.1 },
      'defer': { computationalLoad: -0.1, queueDepth: 0.2 },
      'preload': { latency: -0.1, memoryPressure: 0.1 },
      'hibernate': { energy: 0.5, computationalLoad: -0.5 },
      'alert': {}, // No direct state change
      'adapt_setpoint': {} // Changes target, not state
    };

    const effect = effects[action.type]?.[variable] || 0;
    return Math.max(0, Math.min(1, currentValue + effect * action.magnitude));
  }

  /**
   * Calculate epistemic value (information gain)
   */
  private calculateEpistemicValue(
    action: AllostaticAction,
    predictions: AllostaticPrediction[]
  ): number {
    // Actions that affect high-uncertainty variables have high epistemic value
    const avgConfidence = predictions.reduce((sum, p) => sum + p.confidence, 0) / predictions.length;
    const uncertainty = 1 - avgConfidence;

    // Some actions are more informative than others
    const informativeness: Record<AllostaticActionType, number> = {
      'throttle': 0.3,
      'scale_up': 0.5,
      'scale_down': 0.4,
      'defer': 0.2,
      'preload': 0.4,
      'hibernate': 0.1,
      'alert': 0.6,
      'adapt_setpoint': 0.7
    };

    return uncertainty * (informativeness[action.type] || 0.3);
  }

  /**
   * Calculate ambiguity (expected uncertainty)
   */
  private calculateAmbiguity(
    action: AllostaticAction,
    predictions: AllostaticPrediction[]
  ): number {
    // Ambiguity increases with prediction horizon
    const horizonWeights = predictions.map((p, i) => 1 - p.confidence);
    return horizonWeights.reduce((sum, w) => sum + w, 0) / predictions.length;
  }

  /**
   * Calculate risk (variance of outcomes)
   */
  private calculateRisk(
    action: AllostaticAction,
    predictions: AllostaticPrediction[]
  ): number {
    // Risk based on spread of predictions
    const confidences = predictions.map(p => p.confidence);
    const mean = confidences.reduce((a, b) => a + b, 0) / confidences.length;
    const variance = confidences.reduce((a, b) => a + (b - mean) ** 2, 0) / confidences.length;

    return Math.sqrt(variance);
  }

  /**
   * Select best action by minimizing EFE
   */
  selectAction(
    candidates: AllostaticAction[],
    currentState: InteroceptiveState,
    predictions: AllostaticPrediction[]
  ): AllostaticAction | null {
    if (candidates.length === 0) return null;

    let bestAction = candidates[0];
    let bestEFE = Infinity;

    for (const action of candidates) {
      const efe = this.calculateEFE(action, currentState, predictions);

      // Combined EFE (negative of value, positive for uncertainty)
      const totalEFE = -efe.pragmaticValue - efe.epistemicValue + efe.ambiguity + efe.risk;

      if (totalEFE < bestEFE) {
        bestEFE = totalEFE;
        bestAction = action;
      }
    }

    return bestAction;
  }
}

// ============================================================================
// Main Allostasis System
// ============================================================================

export class AllostasisSystem extends EventEmitter {
  private interoception: InteroceptionSystem;
  private anticipatoryModel: AnticipatoryModel;
  private activeInference: ActiveInferenceController;
  private setpoints: AllostaticSetpoint[];
  private regulationHistory: RegulationResult[];
  private isRegulating: boolean;

  constructor(options: {
    predictionHorizon?: number;
    historySize?: number;
  } = {}) {
    super();

    this.interoception = new InteroceptionSystem(options.historySize || 100);
    this.anticipatoryModel = new AnticipatoryModel(options.predictionHorizon || 10000);
    this.activeInference = new ActiveInferenceController();
    this.setpoints = this.initializeSetpoints();
    this.regulationHistory = [];
    this.isRegulating = false;

    // Set default preferences
    this.activeInference.setPreference('energy', 0.7, 1.5);
    this.activeInference.setPreference('computationalLoad', 0.5, 1.0);
    this.activeInference.setPreference('errorRate', 0.0, 2.0);
    this.activeInference.setPreference('memoryPressure', 0.5, 1.0);
  }

  /**
   * Initialize default setpoints
   */
  private initializeSetpoints(): AllostaticSetpoint[] {
    return [
      { variable: 'energy', target: 0.7, tolerance: 0.2, priority: 1, adaptive: true },
      { variable: 'computationalLoad', target: 0.5, tolerance: 0.3, priority: 2, adaptive: true },
      { variable: 'thermalState', target: 0.3, tolerance: 0.2, priority: 1, adaptive: false },
      { variable: 'errorRate', target: 0.0, tolerance: 0.1, priority: 1, adaptive: false },
      { variable: 'latency', target: 0.2, tolerance: 0.3, priority: 2, adaptive: true },
      { variable: 'memoryPressure', target: 0.5, tolerance: 0.3, priority: 2, adaptive: true }
    ];
  }

  /**
   * Register a sensor for internal state
   */
  registerSensor(variable: keyof InteroceptiveState, callback: () => number): void {
    this.interoception.registerSensor(variable, callback);
  }

  /**
   * Main regulation loop
   */
  async regulate(): Promise<AllostaticAction | null> {
    if (this.isRegulating) return null;
    this.isRegulating = true;

    try {
      // Step 1: Sense current state
      const currentState = this.interoception.sense();

      // Step 2: Predict future states
      const history = this.interoception.getHistory();
      const predictions = this.anticipatoryModel.predict(currentState, history);

      // Step 3: Predict future needs
      const needs = this.anticipatoryModel.predictNeeds(currentState, history, this.setpoints);

      // Step 4: Generate candidate actions
      const candidates = this.generateCandidateActions(currentState, needs);

      // Step 5: Select best action using active inference
      const action = this.activeInference.selectAction(candidates, currentState, predictions);

      if (action) {
        // Step 6: Execute action
        const result = await this.executeAction(action, currentState);
        this.regulationHistory.push(result);

        // Trim history
        if (this.regulationHistory.length > 100) {
          this.regulationHistory.shift();
        }

        this.emit('regulation', result);
        return action;
      }

      return null;
    } finally {
      this.isRegulating = false;
    }
  }

  /**
   * Generate candidate actions based on current state and needs
   */
  private generateCandidateActions(
    state: InteroceptiveState,
    needs: FutureNeed[]
  ): AllostaticAction[] {
    const actions: AllostaticAction[] = [];

    // Check for immediate issues
    if (state.computationalLoad > 0.8) {
      actions.push({
        type: 'throttle',
        target: 'processing',
        magnitude: state.computationalLoad - 0.5,
        urgency: 0.9,
        reason: 'High computational load'
      });
    }

    if (state.energy < 0.3) {
      actions.push({
        type: 'hibernate',
        target: 'system',
        magnitude: 0.5,
        urgency: 0.8,
        reason: 'Low energy reserves'
      });
    }

    if (state.memoryPressure > 0.8) {
      actions.push({
        type: 'scale_down',
        target: 'memory',
        magnitude: state.memoryPressure - 0.5,
        urgency: 0.85,
        reason: 'High memory pressure'
      });
    }

    if (state.errorRate > 0.2) {
      actions.push({
        type: 'alert',
        target: 'errors',
        magnitude: state.errorRate,
        urgency: 0.9,
        reason: 'Elevated error rate'
      });
    }

    // Add anticipatory actions for predicted needs
    for (const need of needs) {
      if (need.confidence > 0.5) {
        const urgency = 1 - (need.timeHorizon / 10000);

        if (need.resource === 'energy') {
          actions.push({
            type: 'defer',
            target: 'non-critical',
            magnitude: need.amount,
            urgency,
            reason: `Anticipated energy deficit in ${need.timeHorizon}ms`
          });
        }

        if (need.resource === 'memoryPressure') {
          actions.push({
            type: 'preload',
            target: 'gc',
            magnitude: need.amount,
            urgency,
            reason: `Anticipated memory pressure in ${need.timeHorizon}ms`
          });
        }
      }
    }

    return actions;
  }

  /**
   * Execute a regulation action
   */
  private async executeAction(
    action: AllostaticAction,
    priorState: InteroceptiveState
  ): Promise<RegulationResult> {
    // Predict effect
    const predictedEffect: Partial<InteroceptiveState> = {};

    switch (action.type) {
      case 'throttle':
        predictedEffect.computationalLoad = priorState.computationalLoad * (1 - action.magnitude);
        predictedEffect.latency = priorState.latency * (1 + action.magnitude * 0.5);
        break;

      case 'defer':
        predictedEffect.computationalLoad = priorState.computationalLoad * 0.8;
        break;

      case 'hibernate':
        predictedEffect.energy = Math.min(1, priorState.energy + action.magnitude);
        predictedEffect.computationalLoad = 0.1;
        break;

      case 'scale_down':
        predictedEffect.memoryPressure = priorState.memoryPressure * (1 - action.magnitude);
        break;

      case 'preload':
        // Trigger garbage collection or cleanup
        if (typeof global !== 'undefined' && global.gc) {
          global.gc();
        }
        predictedEffect.memoryPressure = priorState.memoryPressure * 0.8;
        break;
    }

    // v18.1: Execute real regulatory actions via event bus
    try {
      const { getEventBus } = await import('../bus/index.js');
      const bus = getEventBus();

      switch (action.type) {
        case 'throttle': {
          bus.publish('allostasis.throttle', {
            source: 'allostasis', precision: 1.0,
            magnitude: action.magnitude,
          });
          break;
        }
        case 'defer': {
          bus.publish('allostasis.defer', {
            source: 'allostasis', precision: 1.0,
            variable: action.target,
          });
          break;
        }
        case 'hibernate': {
          bus.publish('allostasis.hibernate', {
            source: 'allostasis', precision: 1.0,
            duration: action.magnitude * 10000,
          });
          break;
        }
        case 'scale_down': {
          if (typeof global !== 'undefined' && (global as any).gc) { (global as any).gc(); }
          break;
        }
      }
    } catch (err) {
      console.error('[allostasis] Bus publish failed:', err);
    }

    this.emit('action-executed', action);

    // Wait briefly and measure actual effect
    await new Promise(resolve => setTimeout(resolve, 100));
    const postState = this.interoception.sense();

    const actualEffect: Partial<InteroceptiveState> = {};
    for (const key of Object.keys(predictedEffect)) {
      const value = getStateValue(postState, key);
      if (value !== undefined) {
        setPartialStateValue(actualEffect, key, value);
      }
    }

    // Update anticipatory model
    this.anticipatoryModel.updateModel(postState);

    return {
      action,
      predictedEffect,
      actualEffect,
      success: true
    };
  }

  /**
   * Update a setpoint (adaptive regulation)
   */
  adaptSetpoint(variable: keyof InteroceptiveState, newTarget: number): void {
    const setpoint = this.setpoints.find(s => s.variable === variable);
    if (setpoint && setpoint.adaptive) {
      setpoint.target = newTarget;
      this.activeInference.setPreference(variable, newTarget);
      this.emit('setpoint-adapted', { variable, newTarget });
    }
  }

  /**
   * Get current interoceptive state
   */
  getState(): InteroceptiveState {
    return this.interoception.getState();
  }

  /**
   * Get future predictions
   */
  getPredictions(horizon?: number): AllostaticPrediction[] {
    const state = this.interoception.getState();
    const history = this.interoception.getHistory();
    return this.anticipatoryModel.predict(state, history, horizon);
  }

  /**
   * Get metrics
   */
  getMetrics(): AllostasisMetrics {
    const actionDist = new Map<AllostaticActionType, number>();
    let successCount = 0;
    let totalAnticipation = 0;

    for (const result of this.regulationHistory) {
      const count = actionDist.get(result.action.type) || 0;
      actionDist.set(result.action.type, count + 1);

      if (result.success) successCount++;
      totalAnticipation += result.action.urgency;
    }

    // Calculate setpoint deviations
    const state = this.interoception.getState();
    const deviations = new Map<string, number>();
    for (const setpoint of this.setpoints) {
      const value = state[setpoint.variable] as number;
      deviations.set(setpoint.variable, Math.abs(value - setpoint.target));
    }

    return {
      regulationCount: this.regulationHistory.length,
      successRate: this.regulationHistory.length > 0
        ? successCount / this.regulationHistory.length
        : 1,
      averageAnticipation: this.regulationHistory.length > 0
        ? totalAnticipation / this.regulationHistory.length
        : 0,
      setpointDeviations: deviations,
      actionDistribution: actionDist
    };
  }

  /**
   * Check if regulation is needed
   */
  needsRegulation(): boolean {
    const state = this.interoception.sense();

    for (const setpoint of this.setpoints) {
      const value = state[setpoint.variable] as number;
      const deviation = Math.abs(value - setpoint.target);
      if (deviation > setpoint.tolerance) {
        return true;
      }
    }

    // Also check predictions
    const predictions = this.getPredictions(5000);
    for (const prediction of predictions.slice(0, 3)) {
      for (const setpoint of this.setpoints) {
        const predicted = prediction.state[setpoint.variable];
        if (predicted !== undefined) {
          const deviation = Math.abs(predicted - setpoint.target);
          if (deviation > setpoint.tolerance * 1.5) {
            return true; // Anticipate need
          }
        }
      }
    }

    return false;
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

export function createAllostasisSystem(): AllostasisSystem {
  return new AllostasisSystem({
    predictionHorizon: 10000,
    historySize: 100
  });
}

export default AllostasisSystem;
