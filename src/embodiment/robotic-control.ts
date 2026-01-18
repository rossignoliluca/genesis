/**
 * ROBOTIC CONTROL INTERFACES
 *
 * Control architecture for robotic embodiment.
 * Supports multiple control modes and robot types.
 *
 * Features:
 * - Hierarchical control (task → motion → joint)
 * - Impedance control for compliant manipulation
 * - Motion primitives and skill composition
 * - Safety monitoring and limits
 * - Real-time control loop management
 *
 * Based on:
 * - Modern robotics control theory
 * - Impedance/admittance control
 * - Dynamic Movement Primitives (DMPs)
 * - Operational space control
 */

// ============================================================================
// TYPES
// ============================================================================

export interface RoboticControlConfig {
  controlMode: ControlMode;
  controlFrequency: number;        // Hz
  safetyLimits: SafetyLimits;
  kinematicsType: KinematicsType;
  numJoints: number;
  numEndEffectors: number;
}

export type ControlMode =
  | 'position'       // Joint position control
  | 'velocity'       // Joint velocity control
  | 'torque'         // Direct torque control
  | 'impedance'      // Impedance control
  | 'admittance'     // Admittance control
  | 'hybrid'         // Force-position hybrid
  | 'cartesian';     // Cartesian space control

export type KinematicsType =
  | 'serial'         // Serial manipulator
  | 'parallel'       // Parallel manipulator
  | 'mobile'         // Mobile robot
  | 'legged'         // Legged robot
  | 'humanoid';      // Humanoid robot

export interface SafetyLimits {
  maxJointVelocity: number[];
  maxJointTorque: number[];
  maxCartesianVelocity: number;
  maxCartesianForce: number;
  jointLimitsLower: number[];
  jointLimitsUpper: number[];
  workspaceRadius: number;
  collisionMargin: number;
}

export interface RobotState {
  jointPositions: number[];
  jointVelocities: number[];
  jointTorques: number[];
  jointAccelerations?: number[];
  cartesianPose: Pose;
  cartesianVelocity: Twist;
  externalForces?: Wrench;
  timestamp: number;
}

export interface Pose {
  position: Vec3;
  orientation: Quaternion;
}

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Quaternion {
  w: number;
  x: number;
  y: number;
  z: number;
}

export interface Twist {
  linear: Vec3;
  angular: Vec3;
}

export interface Wrench {
  force: Vec3;
  torque: Vec3;
}

export interface ControlCommand {
  mode: ControlMode;
  jointCommands?: number[];
  cartesianTarget?: Pose;
  impedanceGains?: ImpedanceGains;
  forceTarget?: Wrench;
  timestamp: number;
}

export interface ImpedanceGains {
  stiffness: number[];      // N/m or Nm/rad
  damping: number[];        // N·s/m or Nm·s/rad
  inertia?: number[];       // kg or kg·m²
}

export interface MotionPrimitive {
  id: string;
  name: string;
  type: PrimitiveType;
  duration: number;
  parameters: Record<string, number>;
  waypoints?: Pose[];
}

export type PrimitiveType =
  | 'point_to_point'    // Simple point-to-point motion
  | 'linear'            // Linear Cartesian motion
  | 'circular'          // Circular arc motion
  | 'spline'            // Spline trajectory
  | 'dmp'               // Dynamic Movement Primitive
  | 'rhythmic';         // Rhythmic DMP

export interface ControllerGains {
  kp: number[];         // Proportional gains
  ki: number[];         // Integral gains
  kd: number[];         // Derivative gains
}

export interface TrajectoryPoint {
  time: number;
  positions: number[];
  velocities?: number[];
  accelerations?: number[];
  efforts?: number[];
}

// ============================================================================
// KINEMATICS
// ============================================================================

export class RobotKinematics {
  private dhParameters: DHParameter[];
  private numJoints: number;

  constructor(dhParameters: DHParameter[]) {
    this.dhParameters = dhParameters;
    this.numJoints = dhParameters.length;
  }

  /**
   * Forward kinematics: joint positions → end effector pose
   */
  forwardKinematics(jointPositions: number[]): Pose {
    let transform = this.identityMatrix();

    for (let i = 0; i < this.numJoints; i++) {
      const dh = this.dhParameters[i];
      const theta = jointPositions[i] + (dh.thetaOffset || 0);
      const jointTransform = this.dhTransform(dh.a, dh.d, dh.alpha, theta);
      transform = this.multiplyMatrices(transform, jointTransform);
    }

    return this.matrixToPose(transform);
  }

  /**
   * Inverse kinematics: end effector pose → joint positions
   * Uses iterative Jacobian-based approach
   */
  inverseKinematics(
    targetPose: Pose,
    initialGuess: number[],
    tolerance: number = 1e-4,
    maxIterations: number = 100
  ): { success: boolean; jointPositions: number[] } {
    let q = [...initialGuess];

    for (let iter = 0; iter < maxIterations; iter++) {
      const currentPose = this.forwardKinematics(q);
      const error = this.poseError(currentPose, targetPose);

      // Check convergence
      const errorMagnitude = Math.sqrt(error.reduce((sum, e) => sum + e * e, 0));
      if (errorMagnitude < tolerance) {
        return { success: true, jointPositions: q };
      }

      // Compute Jacobian
      const J = this.computeJacobian(q);

      // Compute pseudo-inverse
      const Jinv = this.pseudoInverse(J);

      // Update joint positions
      const dq = this.matrixVectorMultiply(Jinv, error);
      q = q.map((qi, i) => qi + 0.5 * dq[i]);  // Damped update

      // Apply joint limits
      q = this.clampJoints(q);
    }

    return { success: false, jointPositions: q };
  }

  /**
   * Compute the geometric Jacobian
   */
  computeJacobian(jointPositions: number[]): number[][] {
    const J: number[][] = Array(6).fill(0).map(() => Array(this.numJoints).fill(0));
    const epsilon = 1e-6;

    const currentPose = this.forwardKinematics(jointPositions);

    for (let i = 0; i < this.numJoints; i++) {
      const qPlus = [...jointPositions];
      qPlus[i] += epsilon;

      const posePlus = this.forwardKinematics(qPlus);

      // Position Jacobian (linear velocity)
      J[0][i] = (posePlus.position.x - currentPose.position.x) / epsilon;
      J[1][i] = (posePlus.position.y - currentPose.position.y) / epsilon;
      J[2][i] = (posePlus.position.z - currentPose.position.z) / epsilon;

      // Orientation Jacobian (angular velocity) - simplified
      const rotError = this.quaternionDifference(currentPose.orientation, posePlus.orientation);
      J[3][i] = rotError.x * 2 / epsilon;
      J[4][i] = rotError.y * 2 / epsilon;
      J[5][i] = rotError.z * 2 / epsilon;
    }

    return J;
  }

  private dhTransform(a: number, d: number, alpha: number, theta: number): number[][] {
    const ct = Math.cos(theta);
    const st = Math.sin(theta);
    const ca = Math.cos(alpha);
    const sa = Math.sin(alpha);

    return [
      [ct, -st * ca, st * sa, a * ct],
      [st, ct * ca, -ct * sa, a * st],
      [0, sa, ca, d],
      [0, 0, 0, 1]
    ];
  }

  private identityMatrix(): number[][] {
    return [
      [1, 0, 0, 0],
      [0, 1, 0, 0],
      [0, 0, 1, 0],
      [0, 0, 0, 1]
    ];
  }

  private multiplyMatrices(A: number[][], B: number[][]): number[][] {
    const result: number[][] = Array(4).fill(0).map(() => Array(4).fill(0));
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        for (let k = 0; k < 4; k++) {
          result[i][j] += A[i][k] * B[k][j];
        }
      }
    }
    return result;
  }

  private matrixToPose(T: number[][]): Pose {
    // Extract position
    const position: Vec3 = {
      x: T[0][3],
      y: T[1][3],
      z: T[2][3]
    };

    // Extract rotation matrix and convert to quaternion
    const trace = T[0][0] + T[1][1] + T[2][2];
    let w: number, x: number, y: number, z: number;

    if (trace > 0) {
      const s = 0.5 / Math.sqrt(trace + 1);
      w = 0.25 / s;
      x = (T[2][1] - T[1][2]) * s;
      y = (T[0][2] - T[2][0]) * s;
      z = (T[1][0] - T[0][1]) * s;
    } else if (T[0][0] > T[1][1] && T[0][0] > T[2][2]) {
      const s = 2 * Math.sqrt(1 + T[0][0] - T[1][1] - T[2][2]);
      w = (T[2][1] - T[1][2]) / s;
      x = 0.25 * s;
      y = (T[0][1] + T[1][0]) / s;
      z = (T[0][2] + T[2][0]) / s;
    } else if (T[1][1] > T[2][2]) {
      const s = 2 * Math.sqrt(1 + T[1][1] - T[0][0] - T[2][2]);
      w = (T[0][2] - T[2][0]) / s;
      x = (T[0][1] + T[1][0]) / s;
      y = 0.25 * s;
      z = (T[1][2] + T[2][1]) / s;
    } else {
      const s = 2 * Math.sqrt(1 + T[2][2] - T[0][0] - T[1][1]);
      w = (T[1][0] - T[0][1]) / s;
      x = (T[0][2] + T[2][0]) / s;
      y = (T[1][2] + T[2][1]) / s;
      z = 0.25 * s;
    }

    return { position, orientation: { w, x, y, z } };
  }

  private poseError(current: Pose, target: Pose): number[] {
    return [
      target.position.x - current.position.x,
      target.position.y - current.position.y,
      target.position.z - current.position.z,
      2 * (target.orientation.x - current.orientation.x),
      2 * (target.orientation.y - current.orientation.y),
      2 * (target.orientation.z - current.orientation.z)
    ];
  }

  private quaternionDifference(q1: Quaternion, q2: Quaternion): { x: number; y: number; z: number } {
    // Simplified: just return the imaginary part difference
    return {
      x: q2.x - q1.x,
      y: q2.y - q1.y,
      z: q2.z - q1.z
    };
  }

  private pseudoInverse(J: number[][]): number[][] {
    // Simplified pseudo-inverse using damped least squares
    const m = J.length;
    const n = J[0].length;
    const lambda = 0.01;  // Damping factor

    // Compute J^T
    const JT: number[][] = Array(n).fill(0).map(() => Array(m).fill(0));
    for (let i = 0; i < m; i++) {
      for (let j = 0; j < n; j++) {
        JT[j][i] = J[i][j];
      }
    }

    // Compute J^T * J + lambda^2 * I
    const JTJ: number[][] = Array(n).fill(0).map(() => Array(n).fill(0));
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        for (let k = 0; k < m; k++) {
          JTJ[i][j] += JT[i][k] * J[k][j];
        }
        if (i === j) {
          JTJ[i][j] += lambda * lambda;
        }
      }
    }

    // Simple matrix inversion for small matrices (Gauss-Jordan)
    const inv = this.invertMatrix(JTJ);

    // Compute inv * J^T
    const result: number[][] = Array(n).fill(0).map(() => Array(m).fill(0));
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < m; j++) {
        for (let k = 0; k < n; k++) {
          result[i][j] += inv[i][k] * JT[k][j];
        }
      }
    }

    return result;
  }

  private invertMatrix(A: number[][]): number[][] {
    const n = A.length;
    const augmented: number[][] = A.map((row, i) => [
      ...row,
      ...Array(n).fill(0).map((_, j) => i === j ? 1 : 0)
    ]);

    // Forward elimination
    for (let i = 0; i < n; i++) {
      // Find pivot
      let maxRow = i;
      for (let k = i + 1; k < n; k++) {
        if (Math.abs(augmented[k][i]) > Math.abs(augmented[maxRow][i])) {
          maxRow = k;
        }
      }
      [augmented[i], augmented[maxRow]] = [augmented[maxRow], augmented[i]];

      // Scale row
      const scale = augmented[i][i];
      if (Math.abs(scale) < 1e-10) continue;
      for (let j = 0; j < 2 * n; j++) {
        augmented[i][j] /= scale;
      }

      // Eliminate column
      for (let k = 0; k < n; k++) {
        if (k !== i) {
          const factor = augmented[k][i];
          for (let j = 0; j < 2 * n; j++) {
            augmented[k][j] -= factor * augmented[i][j];
          }
        }
      }
    }

    // Extract inverse
    return augmented.map(row => row.slice(n));
  }

  private matrixVectorMultiply(A: number[][], x: number[]): number[] {
    return A.map(row => row.reduce((sum, a, i) => sum + a * x[i], 0));
  }

  private clampJoints(q: number[]): number[] {
    // Simple clamping to [-π, π]
    return q.map(qi => {
      while (qi > Math.PI) qi -= 2 * Math.PI;
      while (qi < -Math.PI) qi += 2 * Math.PI;
      return qi;
    });
  }
}

interface DHParameter {
  a: number;      // Link length
  d: number;      // Link offset
  alpha: number;  // Link twist
  thetaOffset?: number;  // Joint angle offset
}

// ============================================================================
// CONTROLLERS
// ============================================================================

export class PIDController {
  private kp: number[];
  private ki: number[];
  private kd: number[];
  private integral: number[];
  private prevError: number[];
  private outputLimits: { lower: number[]; upper: number[] };
  private antiWindup: boolean;

  constructor(
    gains: ControllerGains,
    numJoints: number,
    outputLimits?: { lower: number[]; upper: number[] }
  ) {
    this.kp = gains.kp;
    this.ki = gains.ki;
    this.kd = gains.kd;
    this.integral = Array(numJoints).fill(0);
    this.prevError = Array(numJoints).fill(0);
    this.outputLimits = outputLimits || {
      lower: Array(numJoints).fill(-Infinity),
      upper: Array(numJoints).fill(Infinity)
    };
    this.antiWindup = true;
  }

  compute(error: number[], dt: number): number[] {
    const output: number[] = [];

    for (let i = 0; i < error.length; i++) {
      // Proportional
      const p = this.kp[i] * error[i];

      // Integral with anti-windup
      this.integral[i] += error[i] * dt;
      if (this.antiWindup) {
        const maxIntegral = this.outputLimits.upper[i] / (this.ki[i] || 1);
        this.integral[i] = Math.max(-maxIntegral, Math.min(maxIntegral, this.integral[i]));
      }
      const integ = this.ki[i] * this.integral[i];

      // Derivative
      const derivative = (error[i] - this.prevError[i]) / dt;
      const d = this.kd[i] * derivative;

      this.prevError[i] = error[i];

      // Combined output with saturation
      let out = p + integ + d;
      out = Math.max(this.outputLimits.lower[i], Math.min(this.outputLimits.upper[i], out));

      output.push(out);
    }

    return output;
  }

  reset(): void {
    this.integral.fill(0);
    this.prevError.fill(0);
  }
}

export class ImpedanceController {
  private stiffness: number[];
  private damping: number[];
  private inertia: number[];
  private equilibriumPose: Pose;

  constructor(gains: ImpedanceGains, equilibriumPose: Pose) {
    this.stiffness = gains.stiffness;
    this.damping = gains.damping;
    this.inertia = gains.inertia || gains.stiffness.map(() => 1);
    this.equilibriumPose = equilibriumPose;
  }

  compute(currentPose: Pose, currentVelocity: Twist, externalForce?: Wrench): Wrench {
    // Position error
    const posError: Vec3 = {
      x: this.equilibriumPose.position.x - currentPose.position.x,
      y: this.equilibriumPose.position.y - currentPose.position.y,
      z: this.equilibriumPose.position.z - currentPose.position.z
    };

    // Orientation error (simplified)
    const rotError: Vec3 = {
      x: 2 * (this.equilibriumPose.orientation.x - currentPose.orientation.x),
      y: 2 * (this.equilibriumPose.orientation.y - currentPose.orientation.y),
      z: 2 * (this.equilibriumPose.orientation.z - currentPose.orientation.z)
    };

    // Compute wrench: F = K*x + D*dx + M*ddx
    const force: Vec3 = {
      x: this.stiffness[0] * posError.x - this.damping[0] * currentVelocity.linear.x,
      y: this.stiffness[1] * posError.y - this.damping[1] * currentVelocity.linear.y,
      z: this.stiffness[2] * posError.z - this.damping[2] * currentVelocity.linear.z
    };

    const torque: Vec3 = {
      x: this.stiffness[3] * rotError.x - this.damping[3] * currentVelocity.angular.x,
      y: this.stiffness[4] * rotError.y - this.damping[4] * currentVelocity.angular.y,
      z: this.stiffness[5] * rotError.z - this.damping[5] * currentVelocity.angular.z
    };

    return { force, torque };
  }

  setEquilibrium(pose: Pose): void {
    this.equilibriumPose = pose;
  }

  setGains(gains: ImpedanceGains): void {
    this.stiffness = gains.stiffness;
    this.damping = gains.damping;
    if (gains.inertia) {
      this.inertia = gains.inertia;
    }
  }
}

// ============================================================================
// MOTION PRIMITIVES
// ============================================================================

export class DynamicMovementPrimitive {
  private numBasisFunctions: number;
  private weights: number[][];
  private tau: number;           // Time constant
  private alpha_y: number;
  private beta_y: number;
  private alpha_x: number;
  private goal: number[];
  private y0: number[];
  private numDims: number;

  constructor(numDims: number, numBasisFunctions: number = 25) {
    this.numDims = numDims;
    this.numBasisFunctions = numBasisFunctions;

    // Initialize weights
    this.weights = Array(numDims).fill(0).map(() =>
      Array(numBasisFunctions).fill(0)
    );

    // DMP parameters
    this.tau = 1.0;
    this.alpha_y = 25;
    this.beta_y = this.alpha_y / 4;
    this.alpha_x = 1;

    this.goal = Array(numDims).fill(0);
    this.y0 = Array(numDims).fill(0);
  }

  /**
   * Learn from demonstration
   */
  learnFromDemo(trajectory: TrajectoryPoint[]): void {
    if (trajectory.length < 2) return;

    const T = trajectory[trajectory.length - 1].time - trajectory[0].time;
    this.tau = T;

    // Set start and goal
    this.y0 = [...trajectory[0].positions];
    this.goal = [...trajectory[trajectory.length - 1].positions];

    // Compute forcing function targets
    const f_target: number[][] = Array(this.numDims).fill(0).map(() => []);
    const psi_track: number[][] = [];

    for (let i = 0; i < trajectory.length; i++) {
      const t = trajectory[i].time - trajectory[0].time;
      const s = this.canonicalSystem(t);

      // Basis function activations
      const psi = this.basisFunctions(s);
      psi_track.push(psi);

      // Compute target forcing function
      const y = trajectory[i].positions;
      const yd = trajectory[i].velocities || this.numericalDerivative(trajectory, i, 'positions');
      const ydd = trajectory[i].accelerations || this.numericalDerivative(trajectory, i, 'velocities');

      for (let d = 0; d < this.numDims; d++) {
        const f_d = (this.tau * this.tau * ydd[d] - this.alpha_y * (this.beta_y * (this.goal[d] - y[d]) - this.tau * yd[d]));
        f_target[d].push(f_d / (s * (this.goal[d] - this.y0[d] + 1e-10)));
      }
    }

    // Learn weights using locally weighted regression
    for (let d = 0; d < this.numDims; d++) {
      for (let i = 0; i < this.numBasisFunctions; i++) {
        let numerator = 0;
        let denominator = 0;

        for (let t = 0; t < trajectory.length; t++) {
          const psi_i = psi_track[t][i];
          numerator += psi_i * f_target[d][t];
          denominator += psi_i;
        }

        this.weights[d][i] = denominator > 1e-10 ? numerator / denominator : 0;
      }
    }
  }

  /**
   * Generate trajectory
   */
  generate(dt: number): TrajectoryPoint[] {
    const trajectory: TrajectoryPoint[] = [];

    let y = [...this.y0];
    let z = Array(this.numDims).fill(0);  // Scaled velocity
    let t = 0;

    while (t <= this.tau * 1.1) {
      const s = this.canonicalSystem(t);
      const psi = this.basisFunctions(s);

      // Forcing function
      const f: number[] = [];
      for (let d = 0; d < this.numDims; d++) {
        let f_d = 0;
        let psi_sum = 0;
        for (let i = 0; i < this.numBasisFunctions; i++) {
          f_d += psi[i] * this.weights[d][i];
          psi_sum += psi[i];
        }
        f_d = psi_sum > 1e-10 ? f_d / psi_sum * s * (this.goal[d] - this.y0[d]) : 0;
        f.push(f_d);
      }

      // DMP dynamics
      const ydd: number[] = [];
      const yd: number[] = [];

      for (let d = 0; d < this.numDims; d++) {
        const zd = (this.alpha_y * (this.beta_y * (this.goal[d] - y[d]) - z[d]) + f[d]) / this.tau;
        ydd.push(zd / this.tau);
        yd.push(z[d] / this.tau);

        // Integration
        z[d] += zd * dt;
        y[d] += z[d] / this.tau * dt;
      }

      trajectory.push({
        time: t,
        positions: [...y],
        velocities: yd,
        accelerations: ydd
      });

      t += dt;
    }

    return trajectory;
  }

  private canonicalSystem(t: number): number {
    return Math.exp(-this.alpha_x * t / this.tau);
  }

  private basisFunctions(s: number): number[] {
    const centers: number[] = [];
    const widths: number[] = [];

    // Distribute centers in canonical system space
    for (let i = 0; i < this.numBasisFunctions; i++) {
      const c = Math.exp(-this.alpha_x * i / (this.numBasisFunctions - 1));
      centers.push(c);
      widths.push(1.0 / (0.65 * (centers[1] - centers[0]) ** 2));
    }

    // Compute Gaussian activations
    return centers.map((c, i) => Math.exp(-widths[i] * (s - c) ** 2));
  }

  private numericalDerivative(trajectory: TrajectoryPoint[], i: number, field: 'positions' | 'velocities'): number[] {
    const data = trajectory.map(p => p[field] || p.positions);

    if (i === 0) {
      const dt = trajectory[1].time - trajectory[0].time;
      return data[0].map((_, d) => (data[1][d] - data[0][d]) / dt);
    } else if (i === trajectory.length - 1) {
      const dt = trajectory[i].time - trajectory[i - 1].time;
      return data[i].map((_, d) => (data[i][d] - data[i - 1][d]) / dt);
    } else {
      const dt = trajectory[i + 1].time - trajectory[i - 1].time;
      return data[i].map((_, d) => (data[i + 1][d] - data[i - 1][d]) / dt);
    }
  }

  setGoal(goal: number[]): void {
    this.goal = [...goal];
  }

  setTimeScale(tau: number): void {
    this.tau = tau;
  }
}

// ============================================================================
// SAFETY MONITOR
// ============================================================================

export class SafetyMonitor {
  private limits: SafetyLimits;
  private violations: SafetyViolation[] = [];
  private emergencyStop: boolean = false;

  constructor(limits: SafetyLimits) {
    this.limits = limits;
  }

  /**
   * Check state against safety limits
   */
  check(state: RobotState, command: ControlCommand): SafetyCheckResult {
    const violations: SafetyViolation[] = [];

    // Joint position limits
    for (let i = 0; i < state.jointPositions.length; i++) {
      if (state.jointPositions[i] < this.limits.jointLimitsLower[i]) {
        violations.push({
          type: 'joint_limit_lower',
          joint: i,
          value: state.jointPositions[i],
          limit: this.limits.jointLimitsLower[i],
          severity: 'warning'
        });
      }
      if (state.jointPositions[i] > this.limits.jointLimitsUpper[i]) {
        violations.push({
          type: 'joint_limit_upper',
          joint: i,
          value: state.jointPositions[i],
          limit: this.limits.jointLimitsUpper[i],
          severity: 'warning'
        });
      }
    }

    // Joint velocity limits
    for (let i = 0; i < state.jointVelocities.length; i++) {
      if (Math.abs(state.jointVelocities[i]) > this.limits.maxJointVelocity[i]) {
        violations.push({
          type: 'joint_velocity',
          joint: i,
          value: state.jointVelocities[i],
          limit: this.limits.maxJointVelocity[i],
          severity: 'error'
        });
      }
    }

    // Joint torque limits
    for (let i = 0; i < state.jointTorques.length; i++) {
      if (Math.abs(state.jointTorques[i]) > this.limits.maxJointTorque[i]) {
        violations.push({
          type: 'joint_torque',
          joint: i,
          value: state.jointTorques[i],
          limit: this.limits.maxJointTorque[i],
          severity: 'error'
        });
      }
    }

    // Cartesian velocity limit
    const cartVelMag = Math.sqrt(
      state.cartesianVelocity.linear.x ** 2 +
      state.cartesianVelocity.linear.y ** 2 +
      state.cartesianVelocity.linear.z ** 2
    );
    if (cartVelMag > this.limits.maxCartesianVelocity) {
      violations.push({
        type: 'cartesian_velocity',
        value: cartVelMag,
        limit: this.limits.maxCartesianVelocity,
        severity: 'error'
      });
    }

    // Workspace limit
    const distFromOrigin = Math.sqrt(
      state.cartesianPose.position.x ** 2 +
      state.cartesianPose.position.y ** 2 +
      state.cartesianPose.position.z ** 2
    );
    if (distFromOrigin > this.limits.workspaceRadius) {
      violations.push({
        type: 'workspace',
        value: distFromOrigin,
        limit: this.limits.workspaceRadius,
        severity: 'critical'
      });
    }

    // Record violations
    this.violations.push(...violations);

    // Check for emergency stop conditions
    const criticalViolations = violations.filter(v => v.severity === 'critical');
    if (criticalViolations.length > 0) {
      this.emergencyStop = true;
    }

    return {
      safe: violations.length === 0,
      violations,
      emergencyStop: this.emergencyStop,
      modifiedCommand: this.emergencyStop ? this.zeroCommand() : command
    };
  }

  /**
   * Scale command to satisfy limits
   */
  scaleCommand(command: ControlCommand, state: RobotState): ControlCommand {
    if (this.emergencyStop) {
      return this.zeroCommand();
    }

    const scaled = { ...command };

    if (scaled.jointCommands) {
      scaled.jointCommands = scaled.jointCommands.map((cmd, i) => {
        // Scale by velocity limit ratio
        const maxVel = this.limits.maxJointVelocity[i];
        const currentVel = state.jointVelocities[i];
        const availableVel = maxVel - Math.abs(currentVel);

        if (command.mode === 'velocity') {
          return Math.sign(cmd) * Math.min(Math.abs(cmd), availableVel);
        }
        return cmd;
      });
    }

    return scaled;
  }

  private zeroCommand(): ControlCommand {
    return {
      mode: 'torque',
      jointCommands: [],
      timestamp: Date.now()
    };
  }

  resetEmergencyStop(): void {
    this.emergencyStop = false;
  }

  getViolationHistory(): SafetyViolation[] {
    return [...this.violations];
  }

  isEmergencyStopped(): boolean {
    return this.emergencyStop;
  }
}

interface SafetyViolation {
  type: string;
  joint?: number;
  value: number;
  limit: number;
  severity: 'warning' | 'error' | 'critical';
}

interface SafetyCheckResult {
  safe: boolean;
  violations: SafetyViolation[];
  emergencyStop: boolean;
  modifiedCommand: ControlCommand;
}

// ============================================================================
// ROBOTIC CONTROLLER
// ============================================================================

export class RoboticController {
  private config: RoboticControlConfig;
  private kinematics: RobotKinematics;
  private jointController: PIDController;
  private impedanceController?: ImpedanceController;
  private safetyMonitor: SafetyMonitor;
  private currentState: RobotState;
  private dmp?: DynamicMovementPrimitive;

  constructor(config: Partial<RoboticControlConfig> = {}) {
    this.config = {
      controlMode: 'position',
      controlFrequency: 1000,
      safetyLimits: {
        maxJointVelocity: Array(6).fill(2.0),
        maxJointTorque: Array(6).fill(100),
        maxCartesianVelocity: 1.0,
        maxCartesianForce: 50,
        jointLimitsLower: Array(6).fill(-Math.PI),
        jointLimitsUpper: Array(6).fill(Math.PI),
        workspaceRadius: 1.5,
        collisionMargin: 0.05
      },
      kinematicsType: 'serial',
      numJoints: 6,
      numEndEffectors: 1,
      ...config
    };

    // Initialize kinematics (PUMA 560-like arm)
    const dhParams: DHParameter[] = [
      { a: 0, d: 0.6, alpha: -Math.PI / 2 },
      { a: 0.4318, d: 0, alpha: 0 },
      { a: 0.0203, d: 0.15, alpha: -Math.PI / 2 },
      { a: 0, d: 0.4318, alpha: Math.PI / 2 },
      { a: 0, d: 0, alpha: -Math.PI / 2 },
      { a: 0, d: 0, alpha: 0 }
    ];
    this.kinematics = new RobotKinematics(dhParams);

    // Initialize controllers
    this.jointController = new PIDController(
      {
        kp: Array(this.config.numJoints).fill(100),
        ki: Array(this.config.numJoints).fill(10),
        kd: Array(this.config.numJoints).fill(20)
      },
      this.config.numJoints
    );

    this.safetyMonitor = new SafetyMonitor(this.config.safetyLimits);

    // Initialize state
    this.currentState = {
      jointPositions: Array(this.config.numJoints).fill(0),
      jointVelocities: Array(this.config.numJoints).fill(0),
      jointTorques: Array(this.config.numJoints).fill(0),
      cartesianPose: this.kinematics.forwardKinematics(Array(this.config.numJoints).fill(0)),
      cartesianVelocity: {
        linear: { x: 0, y: 0, z: 0 },
        angular: { x: 0, y: 0, z: 0 }
      },
      timestamp: Date.now()
    };
  }

  /**
   * Update state from sensors
   */
  updateState(state: Partial<RobotState>): void {
    this.currentState = {
      ...this.currentState,
      ...state,
      timestamp: Date.now()
    };

    // Update Cartesian pose from joint positions
    if (state.jointPositions) {
      this.currentState.cartesianPose = this.kinematics.forwardKinematics(state.jointPositions);
    }
  }

  /**
   * Compute control command
   */
  computeControl(target: ControlCommand): ControlCommand {
    let command: ControlCommand;

    switch (target.mode) {
      case 'position':
        command = this.positionControl(target);
        break;

      case 'velocity':
        command = this.velocityControl(target);
        break;

      case 'impedance':
        command = this.impedanceControl(target);
        break;

      case 'cartesian':
        command = this.cartesianControl(target);
        break;

      default:
        command = target;
    }

    // Safety check and scaling
    const safetyResult = this.safetyMonitor.check(this.currentState, command);

    if (!safetyResult.safe) {
      command = this.safetyMonitor.scaleCommand(command, this.currentState);
    }

    return command;
  }

  private positionControl(target: ControlCommand): ControlCommand {
    if (!target.jointCommands) {
      return target;
    }

    const error = target.jointCommands.map((t, i) =>
      t - this.currentState.jointPositions[i]
    );

    const torques = this.jointController.compute(error, 1 / this.config.controlFrequency);

    return {
      mode: 'torque',
      jointCommands: torques,
      timestamp: Date.now()
    };
  }

  private velocityControl(target: ControlCommand): ControlCommand {
    if (!target.jointCommands) {
      return target;
    }

    const error = target.jointCommands.map((t, i) =>
      t - this.currentState.jointVelocities[i]
    );

    const torques = this.jointController.compute(error, 1 / this.config.controlFrequency);

    return {
      mode: 'torque',
      jointCommands: torques,
      timestamp: Date.now()
    };
  }

  private impedanceControl(target: ControlCommand): ControlCommand {
    if (!target.cartesianTarget || !target.impedanceGains) {
      return target;
    }

    if (!this.impedanceController) {
      this.impedanceController = new ImpedanceController(
        target.impedanceGains,
        target.cartesianTarget
      );
    } else {
      this.impedanceController.setEquilibrium(target.cartesianTarget);
      this.impedanceController.setGains(target.impedanceGains);
    }

    const wrench = this.impedanceController.compute(
      this.currentState.cartesianPose,
      this.currentState.cartesianVelocity,
      this.currentState.externalForces
    );

    // Convert wrench to joint torques using Jacobian transpose
    const J = this.kinematics.computeJacobian(this.currentState.jointPositions);
    const wrenchVector = [
      wrench.force.x, wrench.force.y, wrench.force.z,
      wrench.torque.x, wrench.torque.y, wrench.torque.z
    ];

    const torques: number[] = Array(this.config.numJoints).fill(0);
    for (let i = 0; i < this.config.numJoints; i++) {
      for (let j = 0; j < 6; j++) {
        torques[i] += J[j][i] * wrenchVector[j];
      }
    }

    return {
      mode: 'torque',
      jointCommands: torques,
      timestamp: Date.now()
    };
  }

  private cartesianControl(target: ControlCommand): ControlCommand {
    if (!target.cartesianTarget) {
      return target;
    }

    // Inverse kinematics
    const { success, jointPositions } = this.kinematics.inverseKinematics(
      target.cartesianTarget,
      this.currentState.jointPositions
    );

    if (!success) {
      console.warn('IK failed to converge');
    }

    return {
      mode: 'position',
      jointCommands: jointPositions,
      timestamp: Date.now()
    };
  }

  /**
   * Learn a motion primitive from demonstration
   */
  learnPrimitive(trajectory: TrajectoryPoint[]): string {
    const dmp = new DynamicMovementPrimitive(this.config.numJoints);
    dmp.learnFromDemo(trajectory);
    this.dmp = dmp;
    return `primitive_${Date.now()}`;
  }

  /**
   * Execute a learned motion primitive
   */
  executePrimitive(goal?: number[]): TrajectoryPoint[] {
    if (!this.dmp) {
      throw new Error('No primitive learned');
    }

    if (goal) {
      this.dmp.setGoal(goal);
    }

    return this.dmp.generate(1 / this.config.controlFrequency);
  }

  /**
   * Get current state
   */
  getState(): RobotState {
    return { ...this.currentState };
  }

  /**
   * Get kinematics
   */
  getKinematics(): RobotKinematics {
    return this.kinematics;
  }

  /**
   * Get safety status
   */
  getSafetyStatus(): { emergencyStopped: boolean; violations: SafetyViolation[] } {
    return {
      emergencyStopped: this.safetyMonitor.isEmergencyStopped(),
      violations: this.safetyMonitor.getViolationHistory()
    };
  }

  /**
   * Reset emergency stop
   */
  resetEmergencyStop(): void {
    this.safetyMonitor.resetEmergencyStop();
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export function createRoboticController(config?: Partial<RoboticControlConfig>): RoboticController {
  return new RoboticController(config);
}

export function createDMP(numDims: number, numBasisFunctions?: number): DynamicMovementPrimitive {
  return new DynamicMovementPrimitive(numDims, numBasisFunctions);
}
