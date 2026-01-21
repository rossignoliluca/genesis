/**
 * Genesis 10.2 - Sensorimotor Loop
 *
 * Completes the closed-loop integration between:
 * - Embodiment (HapticSystem, RoboticController)
 * - Perception (MultiModalPerception)
 * - Cognition (Brain, ConsciousAgent)
 *
 * Architecture:
 * ```
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │                    SENSORIMOTOR LOOP                                │
 * │                                                                     │
 * │    ┌─────────────┐     ┌─────────────┐     ┌─────────────┐         │
 * │    │   SENSORS   │────▶│ PERCEPTION  │────▶│  COGNITION  │         │
 * │    │             │     │             │     │             │         │
 * │    │  Haptic     │     │ MultiModal  │     │   Brain     │         │
 * │    │  Proprio    │     │  Fusion     │     │   GWT       │         │
 * │    │  Visual*    │     │             │     │   φ Monitor │         │
 * │    └─────────────┘     └─────────────┘     └──────┬──────┘         │
 * │                                                    │               │
 * │    ┌─────────────┐     ┌─────────────┐            │               │
 * │    │  ACTUATORS  │◀────│   ACTION    │◀───────────┘               │
 * │    │             │     │  SELECTION  │                             │
 * │    │  Motors     │     │             │                             │
 * │    │  Grippers   │     │  Active     │                             │
 * │    │  Haptic FB  │     │  Inference  │                             │
 * │    └──────┬──────┘     └─────────────┘                             │
 * │           │                                                        │
 * │           └────────────────▶ ENVIRONMENT ◀─────────────────────────┘
 * └─────────────────────────────────────────────────────────────────────┘
 * ```
 *
 * Based on:
 * - Embodied Cognition (Varela, Thompson, Rosch)
 * - Active Inference (Friston) - action-perception loop
 * - Predictive Processing (Clark) - prediction error minimization
 */

import { EventEmitter } from 'events';

// Embodiment imports
import {
  HapticSystem,
  createHapticSystem,
  TactileReading,
  HapticFeedbackCommand,
  GraspAnalysis,
} from './haptic-feedback.js';

import {
  RoboticController,
  createRoboticController,
  JointState,
  CartesianPose,
  ControlCommand,
  SafetyStatus,
  Wrench,
} from './robotic-control.js';

// Perception types (simplified - will integrate with full perception module later)
type ModalityType = 'proprioceptive' | 'tactile' | 'force_torque' | 'visual' | 'auditory';

interface ModalityInput {
  modality: ModalityType;
  data: Float32Array;
  timestamp: Date;
  confidence: number;
}

interface FusedRepresentation {
  timestamp: Date;
  features: Float32Array;
  confidence: number;
  modalities: ModalityType[];
  salience: Map<ModalityType, number>;
}

/**
 * Multi-modal perception stub for sensorimotor integration
 * Will be replaced with full perception module integration
 */
class MultiModalPerception {
  fuse(inputs: ModalityInput[]): FusedRepresentation {
    // Simple fusion: concatenate all features
    let totalSize = 0;
    for (const input of inputs) {
      totalSize += input.data.length;
    }

    const features = new Float32Array(totalSize);
    let offset = 0;
    const salience = new Map<ModalityType, number>();

    for (const input of inputs) {
      features.set(input.data, offset);
      offset += input.data.length;
      salience.set(input.modality, input.confidence);
    }

    return {
      timestamp: new Date(),
      features,
      confidence: inputs.length > 0
        ? inputs.reduce((sum, i) => sum + i.confidence, 0) / inputs.length
        : 0,
      modalities: inputs.map(i => i.modality),
      salience,
    };
  }
}

function createMultiModalPerception(): MultiModalPerception {
  return new MultiModalPerception();
}

// Types for sensorimotor integration
// ============================================================================

export interface SensorState {
  timestamp: Date;

  // Proprioception (body awareness)
  jointStates: JointState[];
  endEffectorPose: CartesianPose;

  // Tactile (touch)
  tactileReadings: TactileReading[];
  graspAnalysis: GraspAnalysis | null;

  // Force/Torque
  forces: number[];
  torques: number[];

  // Safety
  safetyStatus: SafetyStatus;
}

export interface MotorCommand {
  id: string;
  timestamp: Date;
  type: 'position' | 'velocity' | 'force' | 'impedance' | 'grasp';

  // Target values
  jointTargets?: number[];
  cartesianTarget?: CartesianPose;
  forceTarget?: number[];
  graspForce?: number;

  // Control parameters
  stiffness?: number[];
  damping?: number[];

  // Metadata
  source: 'brain' | 'reflex' | 'learned';
  priority: number;
  timeout: number;
}

export interface MotorResult {
  command: MotorCommand;
  success: boolean;
  actualState: SensorState;
  error?: string;
  predictionError: number;  // Difference from expected
}

export interface SensoriMotorConfig {
  /** Update frequency in Hz */
  frequency: number;

  /** Enable predictive processing */
  predictiveProcessing: boolean;

  /** Prediction horizon in ms */
  predictionHorizon: number;

  /** Enable reflexes (fast low-level responses) */
  reflexesEnabled: boolean;

  /** Reflex latency threshold in ms */
  reflexLatency: number;

  /** Enable haptic feedback generation */
  hapticFeedbackEnabled: boolean;

  /** Safety limits */
  maxForce: number;
  maxVelocity: number;

  /** Verbose logging */
  verbose: boolean;
}

export const DEFAULT_SENSORIMOTOR_CONFIG: SensoriMotorConfig = {
  frequency: 100,  // 100 Hz control loop
  predictiveProcessing: true,
  predictionHorizon: 100,  // 100ms ahead
  reflexesEnabled: true,
  reflexLatency: 10,  // 10ms for reflexes
  hapticFeedbackEnabled: true,
  maxForce: 50,  // N
  maxVelocity: 1.0,  // m/s
  verbose: false,
};

// Prediction model for sensorimotor integration
// ============================================================================

interface Prediction {
  expectedState: SensorState;
  confidence: number;
  timestamp: Date;
}

class ForwardModel {
  private history: Array<{ command: MotorCommand; result: SensorState }> = [];
  private readonly maxHistory = 100;

  /**
   * Predict the next sensor state given a motor command
   * Uses simple forward dynamics model
   */
  predict(currentState: SensorState, command: MotorCommand): Prediction {
    const dt = command.timeout / 1000;  // Convert to seconds

    // Simple kinematic prediction
    const expectedJoints = currentState.jointStates.map((joint, i) => {
      if (command.type === 'velocity' && command.jointTargets) {
        return {
          ...joint,
          position: joint.position + (command.jointTargets[i] || 0) * dt,
          velocity: command.jointTargets[i] || 0,
        };
      }
      if (command.type === 'position' && command.jointTargets) {
        // Interpolate toward target
        const targetPos = command.jointTargets[i] || joint.position;
        const newPos = joint.position + (targetPos - joint.position) * 0.5;
        return {
          ...joint,
          position: newPos,
          velocity: (newPos - joint.position) / dt,
        };
      }
      return joint;
    });

    // Estimate confidence based on history accuracy
    const confidence = this.estimateConfidence(command.type);

    return {
      expectedState: {
        ...currentState,
        timestamp: new Date(Date.now() + command.timeout),
        jointStates: expectedJoints,
      },
      confidence,
      timestamp: new Date(),
    };
  }

  /**
   * Update model with actual result (learning)
   */
  update(command: MotorCommand, actualState: SensorState): void {
    this.history.push({ command, result: actualState });
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }
  }

  /**
   * Calculate prediction error
   */
  calculateError(predicted: Prediction, actual: SensorState): number {
    let totalError = 0;
    let count = 0;

    // Joint position error
    for (let i = 0; i < predicted.expectedState.jointStates.length; i++) {
      const predJoint = predicted.expectedState.jointStates[i];
      const actJoint = actual.jointStates[i];
      if (predJoint && actJoint) {
        totalError += Math.abs(predJoint.position - actJoint.position);
        count++;
      }
    }

    // Force error
    for (let i = 0; i < predicted.expectedState.forces.length; i++) {
      const predForce = predicted.expectedState.forces[i];
      const actForce = actual.forces[i];
      if (predForce !== undefined && actForce !== undefined) {
        totalError += Math.abs(predForce - actForce) / 10;  // Normalize
        count++;
      }
    }

    return count > 0 ? totalError / count : 0;
  }

  private estimateConfidence(commandType: string): number {
    // Simple confidence based on recent accuracy
    const recent = this.history.slice(-10);
    if (recent.length === 0) return 0.5;

    const sameType = recent.filter(h => h.command.type === commandType);
    if (sameType.length === 0) return 0.5;

    // Higher confidence with more successful similar commands
    return Math.min(0.9, 0.5 + sameType.length * 0.04);
  }
}

// Reflex system for fast responses
// ============================================================================

interface Reflex {
  name: string;
  condition: (state: SensorState) => boolean;
  action: (state: SensorState) => MotorCommand;
  priority: number;
}

class ReflexSystem {
  private reflexes: Reflex[] = [];

  constructor() {
    this.initializeReflexes();
  }

  private initializeReflexes(): void {
    // Collision reflex - stop on unexpected force
    this.reflexes.push({
      name: 'collision_stop',
      condition: (state) => {
        const maxForce = Math.max(...state.forces.map(Math.abs));
        return maxForce > 30;  // 30N threshold
      },
      action: (state) => ({
        id: `reflex-collision-${Date.now()}`,
        timestamp: new Date(),
        type: 'velocity',
        jointTargets: state.jointStates.map(() => 0),  // Stop all joints
        source: 'reflex',
        priority: 100,  // Highest priority
        timeout: 50,
      }),
      priority: 100,
    });

    // Slip reflex - increase grip on detected slip
    this.reflexes.push({
      name: 'slip_prevention',
      condition: (state) => {
        if (!state.graspAnalysis) return false;
        return state.graspAnalysis.slipRisk > 0.7;
      },
      action: (state) => ({
        id: `reflex-grip-${Date.now()}`,
        timestamp: new Date(),
        type: 'grasp',
        graspForce: (state.graspAnalysis?.appliedForce || 5) * 1.3,  // 30% increase
        source: 'reflex',
        priority: 90,
        timeout: 100,
      }),
      priority: 90,
    });

    // Joint limit avoidance reflex
    this.reflexes.push({
      name: 'joint_limit_avoidance',
      condition: (state) => {
        return state.jointStates.some(j => {
          const range = j.upperLimit - j.lowerLimit;
          const margin = range * 0.05;  // 5% margin
          return j.position < j.lowerLimit + margin ||
                 j.position > j.upperLimit - margin;
        });
      },
      action: (state) => {
        const velocities = state.jointStates.map(j => {
          const range = j.upperLimit - j.lowerLimit;
          const margin = range * 0.05;
          if (j.position < j.lowerLimit + margin) {
            return 0.1;  // Move away from lower limit
          }
          if (j.position > j.upperLimit - margin) {
            return -0.1;  // Move away from upper limit
          }
          return 0;
        });

        return {
          id: `reflex-limit-${Date.now()}`,
          timestamp: new Date(),
          type: 'velocity',
          jointTargets: velocities,
          source: 'reflex',
          priority: 80,
          timeout: 100,
        };
      },
      priority: 80,
    });
  }

  /**
   * Check all reflexes and return triggered actions
   */
  check(state: SensorState): MotorCommand[] {
    const triggered: MotorCommand[] = [];

    for (const reflex of this.reflexes) {
      if (reflex.condition(state)) {
        triggered.push(reflex.action(state));
      }
    }

    // Sort by priority
    triggered.sort((a, b) => b.priority - a.priority);

    return triggered;
  }

  /**
   * Add a custom reflex
   */
  addReflex(reflex: Reflex): void {
    this.reflexes.push(reflex);
    this.reflexes.sort((a, b) => b.priority - a.priority);
  }
}

// Main Sensorimotor Loop
// ============================================================================

export type SensoriMotorEventType =
  | 'loop:start'
  | 'loop:stop'
  | 'sense:update'
  | 'perception:fused'
  | 'action:commanded'
  | 'action:executed'
  | 'reflex:triggered'
  | 'prediction:error'
  | 'safety:violation';

export type SensoriMotorEventHandler = (event: {
  type: SensoriMotorEventType;
  data?: unknown;
}) => void;

export class SensoriMotorLoop extends EventEmitter {
  private config: SensoriMotorConfig;

  // Subsystems
  private haptic: HapticSystem;
  private robotic: RoboticController;
  private perception: MultiModalPerception;
  private forwardModel: ForwardModel;
  private reflexes: ReflexSystem;

  // State
  private running: boolean = false;
  private loopTimer?: ReturnType<typeof setInterval>;
  private currentState: SensorState | null = null;
  private lastPrediction: Prediction | null = null;
  private commandQueue: MotorCommand[] = [];

  // Metrics
  private cycleCount: number = 0;
  private totalPredictionError: number = 0;
  private reflexTriggers: number = 0;

  // Callbacks
  private cognitiveCallback?: (perception: FusedRepresentation, state: SensorState) => MotorCommand | null;

  constructor(config: Partial<SensoriMotorConfig> = {}) {
    super();
    this.config = { ...DEFAULT_SENSORIMOTOR_CONFIG, ...config };

    // Initialize subsystems
    this.haptic = createHapticSystem();
    this.robotic = createRoboticController();
    this.perception = createMultiModalPerception();
    this.forwardModel = new ForwardModel();
    this.reflexes = new ReflexSystem();
  }

  // ============================================================================
  // Lifecycle
  // ============================================================================

  start(): void {
    if (this.running) return;
    this.running = true;

    const intervalMs = 1000 / this.config.frequency;

    this.loopTimer = setInterval(() => {
      this.runCycle().catch(err => {
        this.log(`Cycle error: ${err}`);
      });
    }, intervalMs);

    this.emit('loop:start', { frequency: this.config.frequency });
    this.log(`Sensorimotor loop started at ${this.config.frequency}Hz`);
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;

    if (this.loopTimer) {
      clearInterval(this.loopTimer);
      this.loopTimer = undefined;
    }

    this.emit('loop:stop', { cycles: this.cycleCount });
    this.log('Sensorimotor loop stopped');
  }

  isRunning(): boolean {
    return this.running;
  }

  // ============================================================================
  // Cognitive Integration
  // ============================================================================

  /**
   * Set callback for cognitive processing
   * This is called each cycle with fused perception and sensor state
   * Should return a motor command or null
   */
  setCognitiveCallback(
    callback: (perception: FusedRepresentation, state: SensorState) => MotorCommand | null
  ): void {
    this.cognitiveCallback = callback;
  }

  /**
   * Queue a motor command from external source (e.g., Brain)
   */
  queueCommand(command: MotorCommand): void {
    this.commandQueue.push(command);
    // Sort by priority
    this.commandQueue.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Get current sensor state (for Brain/ConsciousAgent)
   */
  getSensorState(): SensorState | null {
    return this.currentState;
  }

  // ============================================================================
  // Main Control Loop
  // ============================================================================

  private async runCycle(): Promise<void> {
    this.cycleCount++;
    const cycleStart = Date.now();

    try {
      // 1. SENSE - Read all sensors
      const sensorState = await this.readSensors();
      this.currentState = sensorState;
      this.emit('sense:update', { state: sensorState });

      // 2. CHECK PREDICTION ERROR (Predictive Processing)
      if (this.config.predictiveProcessing && this.lastPrediction) {
        const predError = this.forwardModel.calculateError(
          this.lastPrediction,
          sensorState
        );
        this.totalPredictionError += predError;

        if (predError > 0.1) {  // Significant prediction error
          this.emit('prediction:error', { error: predError, expected: this.lastPrediction });
        }
      }

      // 3. REFLEXES - Fast low-level responses (before perception)
      if (this.config.reflexesEnabled) {
        const reflexCommands = this.reflexes.check(sensorState);
        if (reflexCommands.length > 0) {
          this.reflexTriggers++;
          this.emit('reflex:triggered', { reflexes: reflexCommands.length });

          // Execute highest priority reflex immediately
          await this.executeCommand(reflexCommands[0], sensorState);
          return;  // Skip cognitive processing for this cycle
        }
      }

      // 4. PERCEIVE - Multi-modal fusion
      const fusedPerception = await this.fusePerception(sensorState);
      this.emit('perception:fused', { perception: fusedPerception });

      // 5. COGNITION - Get action from Brain/ConsciousAgent
      let motorCommand: MotorCommand | null = null;

      // First check queued commands
      if (this.commandQueue.length > 0) {
        motorCommand = this.commandQueue.shift()!;
      }
      // Then try cognitive callback
      else if (this.cognitiveCallback) {
        motorCommand = this.cognitiveCallback(fusedPerception, sensorState);
      }

      // 6. ACT - Execute motor command
      if (motorCommand) {
        this.emit('action:commanded', { command: motorCommand });

        // Predict outcome (before execution)
        if (this.config.predictiveProcessing) {
          this.lastPrediction = this.forwardModel.predict(sensorState, motorCommand);
        }

        // Execute
        const result = await this.executeCommand(motorCommand, sensorState);
        this.emit('action:executed', { result });

        // Update forward model with actual result
        this.forwardModel.update(motorCommand, result.actualState);
      }

      // 7. HAPTIC FEEDBACK - Generate feedback based on state
      if (this.config.hapticFeedbackEnabled) {
        await this.generateHapticFeedback(sensorState);
      }

    } catch (error) {
      this.log(`Cycle ${this.cycleCount} error: ${error}`);
    }
  }

  // ============================================================================
  // Sensor Reading
  // ============================================================================

  private async readSensors(): Promise<SensorState> {
    // Get joint states from robotic controller
    const jointStates = this.robotic.getJointStates();
    const endEffectorPose = this.robotic.getEndEffectorPose();

    // Get tactile readings from haptic system
    const tactileReadings = this.haptic.getAllReadings();
    const graspAnalysis = this.haptic.getGraspAnalysis();

    // Get force/torque (from robotic controller or F/T sensor)
    const { forces, torques } = this.robotic.getForceTorque();

    // Get safety status
    const safetyStatus = this.robotic.getSafetyStatus();

    // Check safety violations
    if (!safetyStatus.safe) {
      this.emit('safety:violation', { status: safetyStatus });
    }

    return {
      timestamp: new Date(),
      jointStates,
      endEffectorPose,
      tactileReadings,
      graspAnalysis,
      forces,
      torques,
      safetyStatus,
    };
  }

  // ============================================================================
  // Perception Fusion
  // ============================================================================

  private async fusePerception(sensorState: SensorState): Promise<FusedRepresentation> {
    const inputs: ModalityInput[] = [];
    const now = new Date();

    // Proprioceptive modality (joint states)
    const proprioData = new Float32Array(sensorState.jointStates.length * 3);
    sensorState.jointStates.forEach((joint, i) => {
      proprioData[i * 3] = joint.position;
      proprioData[i * 3 + 1] = joint.velocity;
      proprioData[i * 3 + 2] = joint.effort;
    });
    inputs.push({
      modality: 'proprioceptive' as ModalityType,
      data: proprioData,
      timestamp: now,
      confidence: 0.95,
    });

    // Tactile modality
    if (sensorState.tactileReadings.length > 0) {
      // Flatten tactile data
      const tactileSize = sensorState.tactileReadings.reduce(
        (sum, r) => sum + r.pressureMap.length * r.pressureMap[0].length,
        0
      );
      const tactileData = new Float32Array(tactileSize);
      let offset = 0;
      for (const reading of sensorState.tactileReadings) {
        for (const row of reading.pressureMap) {
          tactileData.set(row, offset);
          offset += row.length;
        }
      }
      inputs.push({
        modality: 'tactile' as ModalityType,
        data: tactileData,
        timestamp: now,
        confidence: 0.9,
      });
    }

    // Force/Torque modality
    const ftData = new Float32Array([...sensorState.forces, ...sensorState.torques]);
    inputs.push({
      modality: 'force_torque' as ModalityType,
      data: ftData,
      timestamp: now,
      confidence: 0.85,
    });

    // Fuse all modalities
    const fused = this.perception.fuse(inputs);

    return fused;
  }

  // ============================================================================
  // Motor Execution
  // ============================================================================

  private async executeCommand(
    command: MotorCommand,
    priorState: SensorState
  ): Promise<MotorResult> {
    const startTime = Date.now();

    try {
      // Safety check
      if (!this.validateCommand(command, priorState)) {
        return {
          command,
          success: false,
          actualState: priorState,
          error: 'Command failed safety validation',
          predictionError: 0,
        };
      }

      // Convert to control command and execute
      const controlCommand = this.toControlCommand(command);
      await this.robotic.executeCommand(controlCommand);

      // Wait for command timeout
      await this.sleep(Math.min(command.timeout, 100));

      // Read actual state after execution
      const actualState = await this.readSensors();

      // Calculate prediction error
      let predictionError = 0;
      if (this.lastPrediction) {
        predictionError = this.forwardModel.calculateError(
          this.lastPrediction,
          actualState
        );
      }

      return {
        command,
        success: true,
        actualState,
        predictionError,
      };

    } catch (error) {
      return {
        command,
        success: false,
        actualState: priorState,
        error: error instanceof Error ? error.message : String(error),
        predictionError: 0,
      };
    }
  }

  private validateCommand(command: MotorCommand, state: SensorState): boolean {
    // Check force limits
    if (command.forceTarget) {
      const maxForce = Math.max(...command.forceTarget.map(Math.abs));
      if (maxForce > this.config.maxForce) {
        this.log(`Force limit exceeded: ${maxForce} > ${this.config.maxForce}`);
        return false;
      }
    }

    // Check velocity limits
    if (command.type === 'velocity' && command.jointTargets) {
      const maxVel = Math.max(...command.jointTargets.map(Math.abs));
      if (maxVel > this.config.maxVelocity) {
        this.log(`Velocity limit exceeded: ${maxVel} > ${this.config.maxVelocity}`);
        return false;
      }
    }

    // Check if system is safe
    if (!state.safetyStatus.safe) {
      this.log('Cannot execute command: safety violation active');
      return false;
    }

    return true;
  }

  private toControlCommand(command: MotorCommand): ControlCommand {
    // Map MotorCommand to RoboticController's ControlCommand format
    const controlCmd: ControlCommand = {
      mode: this.mapCommandMode(command.type),
      jointCommands: command.jointTargets,
      cartesianTarget: command.cartesianTarget,
      timestamp: command.timestamp.getTime(),
    };

    // Map force target to Wrench if provided
    if (command.forceTarget && command.forceTarget.length >= 3) {
      controlCmd.forceTarget = {
        force: {
          x: command.forceTarget[0] || 0,
          y: command.forceTarget[1] || 0,
          z: command.forceTarget[2] || 0,
        },
        torque: {
          x: command.forceTarget[3] || 0,
          y: command.forceTarget[4] || 0,
          z: command.forceTarget[5] || 0,
        },
      };
    }

    // Map stiffness/damping to impedanceGains
    if (command.stiffness || command.damping) {
      controlCmd.impedanceGains = {
        stiffness: command.stiffness || [100, 100, 100, 10, 10, 10],
        damping: command.damping || [10, 10, 10, 1, 1, 1],
      };
    }

    return controlCmd;
  }

  private mapCommandMode(type: MotorCommand['type']): ControlCommand['mode'] {
    switch (type) {
      case 'position': return 'position';
      case 'velocity': return 'velocity';
      case 'force': return 'torque';
      case 'impedance': return 'impedance';
      case 'grasp': return 'position';
      default: return 'position';
    }
  }

  // ============================================================================
  // Haptic Feedback
  // ============================================================================

  private async generateHapticFeedback(state: SensorState): Promise<void> {
    // Generate vibration feedback for slip detection
    if (state.graspAnalysis && state.graspAnalysis.slipRisk > 0.5) {
      const intensity = state.graspAnalysis.slipRisk;
      await this.haptic.generateFeedback({
        type: 'vibration',
        intensity,
        frequency: 200,  // 200 Hz vibration
        duration: 50,    // 50ms pulse
      });
    }

    // Generate force feedback for contact
    const contactForce = Math.max(...state.forces.map(Math.abs));
    if (contactForce > 5) {  // Above 5N threshold
      await this.haptic.generateFeedback({
        type: 'force',
        intensity: Math.min(1, contactForce / this.config.maxForce),
        direction: state.forces,
        duration: 100,
      });
    }
  }

  // ============================================================================
  // Statistics
  // ============================================================================

  stats(): {
    running: boolean;
    cycles: number;
    frequency: number;
    avgPredictionError: number;
    reflexTriggers: number;
    currentState: SensorState | null;
    commandQueueLength: number;
  } {
    return {
      running: this.running,
      cycles: this.cycleCount,
      frequency: this.config.frequency,
      avgPredictionError: this.cycleCount > 0
        ? this.totalPredictionError / this.cycleCount
        : 0,
      reflexTriggers: this.reflexTriggers,
      currentState: this.currentState,
      commandQueueLength: this.commandQueue.length,
    };
  }

  // ============================================================================
  // Utilities
  // ============================================================================

  private log(message: string): void {
    if (this.config.verbose) {
      console.log(`[SensoriMotor] ${message}`);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

export function createSensoriMotorLoop(
  config?: Partial<SensoriMotorConfig>
): SensoriMotorLoop {
  return new SensoriMotorLoop(config);
}

let loopInstance: SensoriMotorLoop | null = null;

export function getSensoriMotorLoop(
  config?: Partial<SensoriMotorConfig>
): SensoriMotorLoop {
  if (!loopInstance) {
    loopInstance = createSensoriMotorLoop(config);
  }
  return loopInstance;
}

export function resetSensoriMotorLoop(): void {
  if (loopInstance) {
    loopInstance.stop();
    loopInstance = null;
  }
}
