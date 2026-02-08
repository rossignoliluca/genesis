/**
 * Genesis Embodiment Module
 *
 * Closed-loop sensorimotor integration:
 * - Haptic feedback and tactile sensing
 * - Robotic control and motor commands
 * - Sensorimotor loop with active inference
 *
 * @module embodiment
 */

// Haptic Feedback System
export {
  HapticSystem,
  createHapticSystem,
  TactileSensor,
  BioTacSensor,
  GelSightSensor,
  TextureRecognizer,
  SlipDetector,
  HapticFeedbackGenerator,
  GraspAnalyzer,
  type HapticConfig,
  type TactileReading,
  type HapticFeedbackCommand,
  type GraspAnalysis,
  type GraspState,
  type ContactState,
  type MaterialProperties,
  type TextureFeatures,
  type HapticFeedback,
  type VibrationPattern,
} from './haptic-feedback.js';

// Robotic Control System
export {
  RoboticController,
  createRoboticController,
  RobotKinematics,
  type RoboticControlConfig,
  type ControlMode,
  type RobotState,
  type Pose,
  type Twist,
  type Wrench,
  type ControlCommand,
  type ImpedanceGains,
  type MotionPrimitive,
  type TrajectoryPoint,
  type JointState,
  type CartesianPose,
  type SafetyLimits,
  type SafetyStatus,
} from './robotic-control.js';

// Sensorimotor Loop
export {
  SensoriMotorLoop,
  createSensoriMotorLoop,
  getSensoriMotorLoop,
  resetSensoriMotorLoop,
  DEFAULT_SENSORIMOTOR_CONFIG,
  type SensoriMotorConfig,
  type SensorState,
  type MotorCommand,
  type MotorResult,
  type SensoriMotorEventType,
  type SensoriMotorEventHandler,
} from './sensorimotor-loop.js';
