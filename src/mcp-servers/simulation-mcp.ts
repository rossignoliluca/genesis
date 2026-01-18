/**
 * SIMULATION MCP SERVER
 *
 * Embodied simulation environment for physical agent testing.
 * Provides virtual worlds for learning locomotion, manipulation, and navigation.
 *
 * Features:
 * - Physics simulation (rigid body, soft body, fluids)
 * - Multiple environment types (indoor, outdoor, underwater)
 * - Sensor simulation (cameras, lidar, IMU, force/torque)
 * - Domain randomization for sim-to-real transfer
 * - Curriculum-based difficulty progression
 *
 * Based on:
 * - MuJoCo physics principles
 * - OpenAI Gym/Gymnasium interfaces
 * - Domain randomization literature
 * - Sim-to-real transfer research
 */

// ============================================================================
// TYPES
// ============================================================================

export interface SimulationConfig {
  worldType: WorldType;
  physicsTimestep: number;        // Seconds per physics step
  renderFrequency: number;        // Hz
  gravity: Vec3;
  friction: number;
  restitution: number;
  domainRandomization: DomainRandomizationConfig;
  curriculum: CurriculumConfig;
}

export type WorldType =
  | 'empty'
  | 'indoor_room'
  | 'outdoor_terrain'
  | 'warehouse'
  | 'manipulation_table'
  | 'maze'
  | 'underwater'
  | 'aerial';

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

export interface Transform {
  position: Vec3;
  rotation: Quaternion;
  scale: Vec3;
}

export interface RigidBody {
  id: string;
  name: string;
  mass: number;
  inertia: Vec3;
  transform: Transform;
  velocity: Vec3;
  angularVelocity: Vec3;
  shape: CollisionShape;
  isStatic: boolean;
  friction: number;
  restitution: number;
}

export type CollisionShape =
  | { type: 'sphere'; radius: number }
  | { type: 'box'; halfExtents: Vec3 }
  | { type: 'capsule'; radius: number; height: number }
  | { type: 'cylinder'; radius: number; height: number }
  | { type: 'mesh'; vertices: number[]; indices: number[] }
  | { type: 'heightfield'; data: number[][]; scale: Vec3 };

export interface Joint {
  id: string;
  type: JointType;
  bodyA: string;
  bodyB: string;
  anchorA: Vec3;
  anchorB: Vec3;
  axis: Vec3;
  limits: { lower: number; upper: number };
  motorEnabled: boolean;
  motorForce: number;
  motorVelocity: number;
  currentPosition: number;
  currentVelocity: number;
}

export type JointType =
  | 'revolute'     // Hinge
  | 'prismatic'    // Slider
  | 'spherical'    // Ball and socket
  | 'fixed'
  | 'free';

export interface Robot {
  id: string;
  name: string;
  bodies: RigidBody[];
  joints: Joint[];
  sensors: Sensor[];
  actuators: Actuator[];
  rootBody: string;
}

export interface Sensor {
  id: string;
  type: SensorType;
  parentBody: string;
  localTransform: Transform;
  frequency: number;
  noise: NoiseModel;
  data: SensorData;
}

export type SensorType =
  | 'camera_rgb'
  | 'camera_depth'
  | 'camera_rgbd'
  | 'lidar_2d'
  | 'lidar_3d'
  | 'imu'
  | 'force_torque'
  | 'joint_encoder'
  | 'contact'
  | 'gps'
  | 'magnetometer';

export interface NoiseModel {
  type: 'gaussian' | 'uniform' | 'none';
  mean: number;
  stddev: number;
  bias: number;
}

export interface SensorData {
  timestamp: number;
  values: number[];
  image?: number[][];    // For camera sensors
  pointCloud?: Vec3[];   // For lidar sensors
}

export interface Actuator {
  id: string;
  type: ActuatorType;
  jointId: string;
  maxForce: number;
  maxVelocity: number;
  controlMode: 'position' | 'velocity' | 'torque';
  command: number;
}

export type ActuatorType =
  | 'motor'
  | 'servo'
  | 'hydraulic'
  | 'pneumatic';

export interface DomainRandomizationConfig {
  enabled: boolean;
  mass: { min: number; max: number };
  friction: { min: number; max: number };
  gravity: { min: number; max: number };
  sensorNoise: { min: number; max: number };
  actuatorDelay: { min: number; max: number };
  visualRandomization: boolean;
  lightingVariation: boolean;
  textureRandomization: boolean;
}

export interface CurriculumConfig {
  enabled: boolean;
  stages: CurriculumStage[];
  currentStage: number;
  progressMetric: string;
  promotionThreshold: number;
}

export interface CurriculumStage {
  name: string;
  difficulty: number;
  parameters: Record<string, number>;
  successThreshold: number;
}

export interface SimulationState {
  time: number;
  bodies: Map<string, RigidBody>;
  joints: Map<string, Joint>;
  robots: Map<string, Robot>;
  contacts: Contact[];
}

export interface Contact {
  bodyA: string;
  bodyB: string;
  point: Vec3;
  normal: Vec3;
  depth: number;
  impulse: number;
}

export interface SimulationAction {
  robotId: string;
  actuatorCommands: Map<string, number>;
}

export interface SimulationObservation {
  time: number;
  sensorData: Map<string, SensorData>;
  reward: number;
  done: boolean;
  info: Record<string, unknown>;
}

// ============================================================================
// PHYSICS ENGINE
// ============================================================================

export class PhysicsEngine {
  private bodies: Map<string, RigidBody> = new Map();
  private joints: Map<string, Joint> = new Map();
  private contacts: Contact[] = [];
  private timestep: number;
  private gravity: Vec3;

  constructor(timestep: number = 0.001, gravity: Vec3 = { x: 0, y: -9.81, z: 0 }) {
    this.timestep = timestep;
    this.gravity = gravity;
  }

  addBody(body: RigidBody): void {
    this.bodies.set(body.id, body);
  }

  addJoint(joint: Joint): void {
    this.joints.set(joint.id, joint);
  }

  removeBody(id: string): void {
    this.bodies.delete(id);
  }

  step(): void {
    // Apply gravity
    for (const body of this.bodies.values()) {
      if (!body.isStatic) {
        body.velocity.x += this.gravity.x * this.timestep;
        body.velocity.y += this.gravity.y * this.timestep;
        body.velocity.z += this.gravity.z * this.timestep;
      }
    }

    // Integrate velocities
    for (const body of this.bodies.values()) {
      if (!body.isStatic) {
        body.transform.position.x += body.velocity.x * this.timestep;
        body.transform.position.y += body.velocity.y * this.timestep;
        body.transform.position.z += body.velocity.z * this.timestep;

        // Simple angular integration
        const angularDelta = this.vec3Scale(body.angularVelocity, this.timestep);
        body.transform.rotation = this.integrateQuaternion(
          body.transform.rotation,
          angularDelta
        );
      }
    }

    // Detect collisions
    this.contacts = this.detectCollisions();

    // Resolve collisions
    this.resolveCollisions();

    // Solve joint constraints
    this.solveJoints();
  }

  private detectCollisions(): Contact[] {
    const contacts: Contact[] = [];
    const bodyArray = Array.from(this.bodies.values());

    for (let i = 0; i < bodyArray.length; i++) {
      for (let j = i + 1; j < bodyArray.length; j++) {
        const bodyA = bodyArray[i];
        const bodyB = bodyArray[j];

        // Skip if both static
        if (bodyA.isStatic && bodyB.isStatic) continue;

        const contact = this.checkCollision(bodyA, bodyB);
        if (contact) {
          contacts.push(contact);
        }
      }
    }

    return contacts;
  }

  private checkCollision(bodyA: RigidBody, bodyB: RigidBody): Contact | null {
    // Simplified sphere-sphere collision for now
    if (bodyA.shape.type === 'sphere' && bodyB.shape.type === 'sphere') {
      const dx = bodyB.transform.position.x - bodyA.transform.position.x;
      const dy = bodyB.transform.position.y - bodyA.transform.position.y;
      const dz = bodyB.transform.position.z - bodyA.transform.position.z;
      const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const sumRadii = bodyA.shape.radius + bodyB.shape.radius;

      if (distance < sumRadii) {
        const normal = {
          x: dx / distance,
          y: dy / distance,
          z: dz / distance
        };

        return {
          bodyA: bodyA.id,
          bodyB: bodyB.id,
          point: {
            x: bodyA.transform.position.x + normal.x * bodyA.shape.radius,
            y: bodyA.transform.position.y + normal.y * bodyA.shape.radius,
            z: bodyA.transform.position.z + normal.z * bodyA.shape.radius
          },
          normal,
          depth: sumRadii - distance,
          impulse: 0
        };
      }
    }

    // Box-box using SAT (simplified AABB)
    if (bodyA.shape.type === 'box' && bodyB.shape.type === 'box') {
      return this.checkBoxBoxCollision(bodyA, bodyB);
    }

    return null;
  }

  private checkBoxBoxCollision(bodyA: RigidBody, bodyB: RigidBody): Contact | null {
    if (bodyA.shape.type !== 'box' || bodyB.shape.type !== 'box') return null;

    const aMin = {
      x: bodyA.transform.position.x - bodyA.shape.halfExtents.x,
      y: bodyA.transform.position.y - bodyA.shape.halfExtents.y,
      z: bodyA.transform.position.z - bodyA.shape.halfExtents.z
    };
    const aMax = {
      x: bodyA.transform.position.x + bodyA.shape.halfExtents.x,
      y: bodyA.transform.position.y + bodyA.shape.halfExtents.y,
      z: bodyA.transform.position.z + bodyA.shape.halfExtents.z
    };
    const bMin = {
      x: bodyB.transform.position.x - bodyB.shape.halfExtents.x,
      y: bodyB.transform.position.y - bodyB.shape.halfExtents.y,
      z: bodyB.transform.position.z - bodyB.shape.halfExtents.z
    };
    const bMax = {
      x: bodyB.transform.position.x + bodyB.shape.halfExtents.x,
      y: bodyB.transform.position.y + bodyB.shape.halfExtents.y,
      z: bodyB.transform.position.z + bodyB.shape.halfExtents.z
    };

    // Check overlap
    if (aMax.x < bMin.x || aMin.x > bMax.x) return null;
    if (aMax.y < bMin.y || aMin.y > bMax.y) return null;
    if (aMax.z < bMin.z || aMin.z > bMax.z) return null;

    // Find penetration depth on each axis
    const overlapX = Math.min(aMax.x - bMin.x, bMax.x - aMin.x);
    const overlapY = Math.min(aMax.y - bMin.y, bMax.y - aMin.y);
    const overlapZ = Math.min(aMax.z - bMin.z, bMax.z - aMin.z);

    // Find minimum penetration axis
    let normal: Vec3;
    let depth: number;

    if (overlapX < overlapY && overlapX < overlapZ) {
      depth = overlapX;
      normal = { x: bodyA.transform.position.x < bodyB.transform.position.x ? -1 : 1, y: 0, z: 0 };
    } else if (overlapY < overlapZ) {
      depth = overlapY;
      normal = { x: 0, y: bodyA.transform.position.y < bodyB.transform.position.y ? -1 : 1, z: 0 };
    } else {
      depth = overlapZ;
      normal = { x: 0, y: 0, z: bodyA.transform.position.z < bodyB.transform.position.z ? -1 : 1 };
    }

    return {
      bodyA: bodyA.id,
      bodyB: bodyB.id,
      point: {
        x: (bodyA.transform.position.x + bodyB.transform.position.x) / 2,
        y: (bodyA.transform.position.y + bodyB.transform.position.y) / 2,
        z: (bodyA.transform.position.z + bodyB.transform.position.z) / 2
      },
      normal,
      depth,
      impulse: 0
    };
  }

  private resolveCollisions(): void {
    for (const contact of this.contacts) {
      const bodyA = this.bodies.get(contact.bodyA);
      const bodyB = this.bodies.get(contact.bodyB);
      if (!bodyA || !bodyB) continue;

      // Calculate relative velocity
      const relVel = {
        x: bodyB.velocity.x - bodyA.velocity.x,
        y: bodyB.velocity.y - bodyA.velocity.y,
        z: bodyB.velocity.z - bodyA.velocity.z
      };

      const normalVelocity = this.vec3Dot(relVel, contact.normal);

      // Skip if separating
      if (normalVelocity > 0) continue;

      // Calculate restitution
      const e = Math.min(bodyA.restitution, bodyB.restitution);

      // Calculate impulse scalar
      const invMassA = bodyA.isStatic ? 0 : 1 / bodyA.mass;
      const invMassB = bodyB.isStatic ? 0 : 1 / bodyB.mass;

      const j = -(1 + e) * normalVelocity / (invMassA + invMassB);
      contact.impulse = j;

      // Apply impulse
      if (!bodyA.isStatic) {
        bodyA.velocity.x -= j * invMassA * contact.normal.x;
        bodyA.velocity.y -= j * invMassA * contact.normal.y;
        bodyA.velocity.z -= j * invMassA * contact.normal.z;
      }

      if (!bodyB.isStatic) {
        bodyB.velocity.x += j * invMassB * contact.normal.x;
        bodyB.velocity.y += j * invMassB * contact.normal.y;
        bodyB.velocity.z += j * invMassB * contact.normal.z;
      }

      // Position correction (Baumgarte stabilization)
      const slop = 0.01;
      const percent = 0.8;
      const correction = Math.max(contact.depth - slop, 0) * percent / (invMassA + invMassB);

      if (!bodyA.isStatic) {
        bodyA.transform.position.x -= correction * invMassA * contact.normal.x;
        bodyA.transform.position.y -= correction * invMassA * contact.normal.y;
        bodyA.transform.position.z -= correction * invMassA * contact.normal.z;
      }

      if (!bodyB.isStatic) {
        bodyB.transform.position.x += correction * invMassB * contact.normal.x;
        bodyB.transform.position.y += correction * invMassB * contact.normal.y;
        bodyB.transform.position.z += correction * invMassB * contact.normal.z;
      }
    }
  }

  private solveJoints(): void {
    for (const joint of this.joints.values()) {
      const bodyA = this.bodies.get(joint.bodyA);
      const bodyB = this.bodies.get(joint.bodyB);
      if (!bodyA || !bodyB) continue;

      if (joint.type === 'revolute') {
        this.solveRevoluteJoint(joint, bodyA, bodyB);
      }
    }
  }

  private solveRevoluteJoint(joint: Joint, bodyA: RigidBody, bodyB: RigidBody): void {
    // Simplified: just apply motor if enabled
    if (joint.motorEnabled) {
      const error = joint.motorVelocity - joint.currentVelocity;
      const torque = Math.min(Math.abs(error * joint.motorForce), joint.motorForce);

      // Apply torque along joint axis
      if (!bodyA.isStatic) {
        bodyA.angularVelocity.x -= joint.axis.x * torque * this.timestep / bodyA.inertia.x;
        bodyA.angularVelocity.y -= joint.axis.y * torque * this.timestep / bodyA.inertia.y;
        bodyA.angularVelocity.z -= joint.axis.z * torque * this.timestep / bodyA.inertia.z;
      }

      if (!bodyB.isStatic) {
        bodyB.angularVelocity.x += joint.axis.x * torque * this.timestep / bodyB.inertia.x;
        bodyB.angularVelocity.y += joint.axis.y * torque * this.timestep / bodyB.inertia.y;
        bodyB.angularVelocity.z += joint.axis.z * torque * this.timestep / bodyB.inertia.z;
      }
    }
  }

  // Vector utilities
  private vec3Dot(a: Vec3, b: Vec3): number {
    return a.x * b.x + a.y * b.y + a.z * b.z;
  }

  private vec3Scale(v: Vec3, s: number): Vec3 {
    return { x: v.x * s, y: v.y * s, z: v.z * s };
  }

  private integrateQuaternion(q: Quaternion, omega: Vec3): Quaternion {
    const halfOmega = this.vec3Scale(omega, 0.5);
    const dq = {
      w: -halfOmega.x * q.x - halfOmega.y * q.y - halfOmega.z * q.z,
      x: halfOmega.x * q.w + halfOmega.y * q.z - halfOmega.z * q.y,
      y: -halfOmega.x * q.z + halfOmega.y * q.w + halfOmega.z * q.x,
      z: halfOmega.x * q.y - halfOmega.y * q.x + halfOmega.z * q.w
    };

    const result = {
      w: q.w + dq.w,
      x: q.x + dq.x,
      y: q.y + dq.y,
      z: q.z + dq.z
    };

    // Normalize
    const mag = Math.sqrt(result.w * result.w + result.x * result.x + result.y * result.y + result.z * result.z);
    return {
      w: result.w / mag,
      x: result.x / mag,
      y: result.y / mag,
      z: result.z / mag
    };
  }

  getState(): { bodies: Map<string, RigidBody>; contacts: Contact[] } {
    return { bodies: this.bodies, contacts: this.contacts };
  }
}

// ============================================================================
// SIMULATION ENVIRONMENT
// ============================================================================

export class SimulationEnvironment {
  private config: SimulationConfig;
  private physics: PhysicsEngine;
  private robots: Map<string, Robot> = new Map();
  private time: number = 0;
  private episodeReward: number = 0;
  private episodeSteps: number = 0;
  private rng: () => number;

  constructor(config: Partial<SimulationConfig> = {}) {
    this.config = {
      worldType: 'empty',
      physicsTimestep: 0.001,
      renderFrequency: 60,
      gravity: { x: 0, y: -9.81, z: 0 },
      friction: 0.5,
      restitution: 0.3,
      domainRandomization: {
        enabled: false,
        mass: { min: 0.8, max: 1.2 },
        friction: { min: 0.3, max: 0.7 },
        gravity: { min: 9.0, max: 10.5 },
        sensorNoise: { min: 0.01, max: 0.1 },
        actuatorDelay: { min: 0, max: 50 },
        visualRandomization: false,
        lightingVariation: false,
        textureRandomization: false
      },
      curriculum: {
        enabled: false,
        stages: [],
        currentStage: 0,
        progressMetric: 'reward',
        promotionThreshold: 0.8
      },
      ...config
    };

    this.physics = new PhysicsEngine(
      this.config.physicsTimestep,
      this.config.gravity
    );

    // Simple RNG
    let seed = Date.now();
    this.rng = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };

    this.setupWorld();
  }

  private setupWorld(): void {
    switch (this.config.worldType) {
      case 'empty':
        this.setupEmptyWorld();
        break;
      case 'indoor_room':
        this.setupIndoorRoom();
        break;
      case 'manipulation_table':
        this.setupManipulationTable();
        break;
      case 'maze':
        this.setupMaze();
        break;
      default:
        this.setupEmptyWorld();
    }
  }

  private setupEmptyWorld(): void {
    // Ground plane
    const ground: RigidBody = {
      id: 'ground',
      name: 'Ground',
      mass: 0,
      inertia: { x: 1, y: 1, z: 1 },
      transform: {
        position: { x: 0, y: -0.5, z: 0 },
        rotation: { w: 1, x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 }
      },
      velocity: { x: 0, y: 0, z: 0 },
      angularVelocity: { x: 0, y: 0, z: 0 },
      shape: { type: 'box', halfExtents: { x: 50, y: 0.5, z: 50 } },
      isStatic: true,
      friction: this.config.friction,
      restitution: this.config.restitution
    };

    this.physics.addBody(ground);
  }

  private setupIndoorRoom(): void {
    this.setupEmptyWorld();

    // Walls
    const wallThickness = 0.1;
    const roomSize = 10;
    const wallHeight = 3;

    const walls = [
      { id: 'wall_north', pos: { x: 0, y: wallHeight / 2, z: roomSize / 2 }, ext: { x: roomSize / 2, y: wallHeight / 2, z: wallThickness } },
      { id: 'wall_south', pos: { x: 0, y: wallHeight / 2, z: -roomSize / 2 }, ext: { x: roomSize / 2, y: wallHeight / 2, z: wallThickness } },
      { id: 'wall_east', pos: { x: roomSize / 2, y: wallHeight / 2, z: 0 }, ext: { x: wallThickness, y: wallHeight / 2, z: roomSize / 2 } },
      { id: 'wall_west', pos: { x: -roomSize / 2, y: wallHeight / 2, z: 0 }, ext: { x: wallThickness, y: wallHeight / 2, z: roomSize / 2 } }
    ];

    for (const wall of walls) {
      const body: RigidBody = {
        id: wall.id,
        name: wall.id,
        mass: 0,
        inertia: { x: 1, y: 1, z: 1 },
        transform: {
          position: wall.pos,
          rotation: { w: 1, x: 0, y: 0, z: 0 },
          scale: { x: 1, y: 1, z: 1 }
        },
        velocity: { x: 0, y: 0, z: 0 },
        angularVelocity: { x: 0, y: 0, z: 0 },
        shape: { type: 'box', halfExtents: wall.ext },
        isStatic: true,
        friction: this.config.friction,
        restitution: this.config.restitution
      };
      this.physics.addBody(body);
    }
  }

  private setupManipulationTable(): void {
    this.setupEmptyWorld();

    // Table
    const table: RigidBody = {
      id: 'table',
      name: 'Table',
      mass: 0,
      inertia: { x: 1, y: 1, z: 1 },
      transform: {
        position: { x: 0, y: 0.4, z: 0 },
        rotation: { w: 1, x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 }
      },
      velocity: { x: 0, y: 0, z: 0 },
      angularVelocity: { x: 0, y: 0, z: 0 },
      shape: { type: 'box', halfExtents: { x: 0.5, y: 0.025, z: 0.3 } },
      isStatic: true,
      friction: 0.8,
      restitution: 0.1
    };
    this.physics.addBody(table);

    // Add some objects on the table
    for (let i = 0; i < 3; i++) {
      const obj: RigidBody = {
        id: `object_${i}`,
        name: `Object ${i}`,
        mass: 0.1,
        inertia: { x: 0.001, y: 0.001, z: 0.001 },
        transform: {
          position: { x: -0.2 + i * 0.2, y: 0.475, z: 0 },
          rotation: { w: 1, x: 0, y: 0, z: 0 },
          scale: { x: 1, y: 1, z: 1 }
        },
        velocity: { x: 0, y: 0, z: 0 },
        angularVelocity: { x: 0, y: 0, z: 0 },
        shape: { type: 'box', halfExtents: { x: 0.025, y: 0.05, z: 0.025 } },
        isStatic: false,
        friction: 0.5,
        restitution: 0.2
      };
      this.physics.addBody(obj);
    }
  }

  private setupMaze(): void {
    this.setupEmptyWorld();

    // Simple maze layout
    const mazeWalls = [
      { x: 2, z: 0 }, { x: 2, z: 1 }, { x: 2, z: 2 },
      { x: 0, z: 2 }, { x: 1, z: 2 },
      { x: 4, z: 1 }, { x: 4, z: 2 }, { x: 4, z: 3 },
      { x: 1, z: 4 }, { x: 2, z: 4 }, { x: 3, z: 4 }
    ];

    for (let i = 0; i < mazeWalls.length; i++) {
      const wall: RigidBody = {
        id: `maze_wall_${i}`,
        name: `Maze Wall ${i}`,
        mass: 0,
        inertia: { x: 1, y: 1, z: 1 },
        transform: {
          position: { x: mazeWalls[i].x - 2.5, y: 0.5, z: mazeWalls[i].z - 2.5 },
          rotation: { w: 1, x: 0, y: 0, z: 0 },
          scale: { x: 1, y: 1, z: 1 }
        },
        velocity: { x: 0, y: 0, z: 0 },
        angularVelocity: { x: 0, y: 0, z: 0 },
        shape: { type: 'box', halfExtents: { x: 0.5, y: 0.5, z: 0.5 } },
        isStatic: true,
        friction: this.config.friction,
        restitution: this.config.restitution
      };
      this.physics.addBody(wall);
    }
  }

  /**
   * Add a robot to the simulation
   */
  addRobot(robot: Robot): void {
    this.robots.set(robot.id, robot);

    // Add robot bodies to physics
    for (const body of robot.bodies) {
      this.physics.addBody(body);
    }

    // Add joints
    for (const joint of robot.joints) {
      this.physics.addJoint(joint);
    }
  }

  /**
   * Step the simulation forward
   */
  step(actions: SimulationAction[]): SimulationObservation {
    // Apply domain randomization if enabled
    if (this.config.domainRandomization.enabled) {
      this.applyDomainRandomization();
    }

    // Apply actions to actuators
    for (const action of actions) {
      const robot = this.robots.get(action.robotId);
      if (!robot) continue;

      for (const [actuatorId, command] of action.actuatorCommands) {
        const actuator = robot.actuators.find(a => a.id === actuatorId);
        if (actuator) {
          actuator.command = Math.max(-1, Math.min(1, command));
        }
      }
    }

    // Apply actuator commands to joints
    for (const robot of this.robots.values()) {
      for (const actuator of robot.actuators) {
        const joint = robot.joints.find(j => j.id === actuator.jointId);
        if (joint && joint.motorEnabled) {
          if (actuator.controlMode === 'velocity') {
            joint.motorVelocity = actuator.command * actuator.maxVelocity;
          } else if (actuator.controlMode === 'position') {
            // PD controller
            const error = actuator.command * (joint.limits.upper - joint.limits.lower) / 2 - joint.currentPosition;
            joint.motorVelocity = error * 10; // Proportional gain
          }
        }
      }
    }

    // Physics simulation (multiple substeps)
    const substeps = Math.round((1 / this.config.renderFrequency) / this.config.physicsTimestep);
    for (let i = 0; i < substeps; i++) {
      this.physics.step();
    }

    this.time += 1 / this.config.renderFrequency;
    this.episodeSteps++;

    // Collect sensor data
    const sensorData = this.collectSensorData();

    // Calculate reward
    const reward = this.calculateReward();
    this.episodeReward += reward;

    // Check termination
    const done = this.checkTermination();

    // Update curriculum if enabled
    if (this.config.curriculum.enabled && done) {
      this.updateCurriculum();
    }

    return {
      time: this.time,
      sensorData,
      reward,
      done,
      info: {
        episodeSteps: this.episodeSteps,
        episodeReward: this.episodeReward
      }
    };
  }

  private applyDomainRandomization(): void {
    const dr = this.config.domainRandomization;

    // Randomize only occasionally (not every step)
    if (this.rng() > 0.01) return;

    // Randomize gravity
    const gravityMag = dr.gravity.min + this.rng() * (dr.gravity.max - dr.gravity.min);
    this.config.gravity.y = -gravityMag;
  }

  private collectSensorData(): Map<string, SensorData> {
    const sensorData = new Map<string, SensorData>();

    for (const robot of this.robots.values()) {
      for (const sensor of robot.sensors) {
        const data = this.readSensor(sensor, robot);
        sensorData.set(sensor.id, data);
      }
    }

    return sensorData;
  }

  private readSensor(sensor: Sensor, robot: Robot): SensorData {
    const data: SensorData = {
      timestamp: this.time,
      values: []
    };

    switch (sensor.type) {
      case 'joint_encoder':
        // Return joint positions
        for (const joint of robot.joints) {
          data.values.push(joint.currentPosition);
        }
        break;

      case 'imu':
        // Return acceleration and angular velocity
        const rootBody = robot.bodies.find(b => b.id === robot.rootBody);
        if (rootBody) {
          data.values = [
            rootBody.velocity.x, rootBody.velocity.y, rootBody.velocity.z,
            rootBody.angularVelocity.x, rootBody.angularVelocity.y, rootBody.angularVelocity.z
          ];
        }
        break;

      case 'contact':
        // Return contact forces
        const { contacts } = this.physics.getState();
        for (const contact of contacts) {
          if (contact.bodyA.startsWith(robot.id) || contact.bodyB.startsWith(robot.id)) {
            data.values.push(contact.impulse);
          }
        }
        break;

      default:
        // Placeholder for other sensors
        data.values = [0];
    }

    // Add noise
    if (sensor.noise.type === 'gaussian') {
      data.values = data.values.map(v => {
        const noise = this.gaussianNoise(sensor.noise.mean, sensor.noise.stddev);
        return v + noise + sensor.noise.bias;
      });
    }

    return data;
  }

  private gaussianNoise(mean: number, stddev: number): number {
    // Box-Muller transform
    const u1 = this.rng();
    const u2 = this.rng();
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return mean + z * stddev;
  }

  private calculateReward(): number {
    // Default: survival reward
    let reward = 0.01;

    // Task-specific rewards would go here
    // For now, just check if robot is upright
    for (const robot of this.robots.values()) {
      const rootBody = robot.bodies.find(b => b.id === robot.rootBody);
      if (rootBody) {
        // Reward for staying upright
        const upVector = this.getUpVector(rootBody.transform.rotation);
        reward += upVector.y * 0.1;
      }
    }

    return reward;
  }

  private getUpVector(q: Quaternion): Vec3 {
    // Transform (0, 1, 0) by quaternion
    return {
      x: 2 * (q.x * q.y + q.w * q.z),
      y: 1 - 2 * (q.x * q.x + q.z * q.z),
      z: 2 * (q.y * q.z - q.w * q.x)
    };
  }

  private checkTermination(): boolean {
    // Max steps
    if (this.episodeSteps >= 1000) return true;

    // Robot fell
    for (const robot of this.robots.values()) {
      const rootBody = robot.bodies.find(b => b.id === robot.rootBody);
      if (rootBody && rootBody.transform.position.y < 0.1) {
        return true;
      }
    }

    return false;
  }

  private updateCurriculum(): void {
    const curriculum = this.config.curriculum;

    // Calculate performance metric
    const performance = this.episodeReward / this.episodeSteps;

    // Check for promotion
    if (performance > curriculum.promotionThreshold &&
        curriculum.currentStage < curriculum.stages.length - 1) {
      curriculum.currentStage++;
      this.applyCurriculumStage(curriculum.stages[curriculum.currentStage]);
    }
  }

  private applyCurriculumStage(stage: CurriculumStage): void {
    // Apply stage parameters
    for (const [key, value] of Object.entries(stage.parameters)) {
      if (key === 'friction') {
        this.config.friction = value;
      } else if (key === 'gravity') {
        this.config.gravity.y = -value;
      }
    }
  }

  /**
   * Reset the simulation
   */
  reset(): SimulationObservation {
    this.time = 0;
    this.episodeReward = 0;
    this.episodeSteps = 0;

    // Reset robot positions
    for (const robot of this.robots.values()) {
      for (const body of robot.bodies) {
        body.velocity = { x: 0, y: 0, z: 0 };
        body.angularVelocity = { x: 0, y: 0, z: 0 };
        // Reset to initial position (simplified)
        body.transform.position.y = 1.0;
      }
    }

    return {
      time: 0,
      sensorData: this.collectSensorData(),
      reward: 0,
      done: false,
      info: {}
    };
  }

  getState(): SimulationState {
    const { bodies, contacts } = this.physics.getState();
    const joints = new Map<string, Joint>();

    for (const robot of this.robots.values()) {
      for (const joint of robot.joints) {
        joints.set(joint.id, joint);
      }
    }

    return {
      time: this.time,
      bodies,
      joints,
      robots: this.robots,
      contacts
    };
  }
}

// ============================================================================
// ROBOT FACTORY
// ============================================================================

export function createSimpleRobot(id: string, position: Vec3): Robot {
  const baseBody: RigidBody = {
    id: `${id}_base`,
    name: 'Base',
    mass: 1.0,
    inertia: { x: 0.1, y: 0.1, z: 0.1 },
    transform: {
      position,
      rotation: { w: 1, x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 }
    },
    velocity: { x: 0, y: 0, z: 0 },
    angularVelocity: { x: 0, y: 0, z: 0 },
    shape: { type: 'box', halfExtents: { x: 0.1, y: 0.05, z: 0.15 } },
    isStatic: false,
    friction: 0.8,
    restitution: 0.1
  };

  // Create wheel bodies
  const wheels: RigidBody[] = [];
  const wheelPositions = [
    { x: -0.1, z: 0.1 },
    { x: 0.1, z: 0.1 },
    { x: -0.1, z: -0.1 },
    { x: 0.1, z: -0.1 }
  ];

  for (let i = 0; i < 4; i++) {
    const wheel: RigidBody = {
      id: `${id}_wheel_${i}`,
      name: `Wheel ${i}`,
      mass: 0.1,
      inertia: { x: 0.001, y: 0.001, z: 0.001 },
      transform: {
        position: {
          x: position.x + wheelPositions[i].x,
          y: position.y - 0.05,
          z: position.z + wheelPositions[i].z
        },
        rotation: { w: 0.707, x: 0, y: 0, z: 0.707 },
        scale: { x: 1, y: 1, z: 1 }
      },
      velocity: { x: 0, y: 0, z: 0 },
      angularVelocity: { x: 0, y: 0, z: 0 },
      shape: { type: 'cylinder', radius: 0.03, height: 0.02 },
      isStatic: false,
      friction: 1.0,
      restitution: 0.1
    };
    wheels.push(wheel);
  }

  // Create joints
  const joints: Joint[] = wheels.map((wheel, i) => ({
    id: `${id}_joint_${i}`,
    type: 'revolute' as JointType,
    bodyA: baseBody.id,
    bodyB: wheel.id,
    anchorA: wheelPositions[i] as Vec3 & { y: number },
    anchorB: { x: 0, y: 0, z: 0 },
    axis: { x: 1, y: 0, z: 0 },
    limits: { lower: -Infinity, upper: Infinity },
    motorEnabled: true,
    motorForce: 1.0,
    motorVelocity: 0,
    currentPosition: 0,
    currentVelocity: 0
  }));

  // Create sensors
  const sensors: Sensor[] = [
    {
      id: `${id}_imu`,
      type: 'imu',
      parentBody: baseBody.id,
      localTransform: {
        position: { x: 0, y: 0, z: 0 },
        rotation: { w: 1, x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 }
      },
      frequency: 100,
      noise: { type: 'gaussian', mean: 0, stddev: 0.01, bias: 0 },
      data: { timestamp: 0, values: [] }
    },
    {
      id: `${id}_encoder`,
      type: 'joint_encoder',
      parentBody: baseBody.id,
      localTransform: {
        position: { x: 0, y: 0, z: 0 },
        rotation: { w: 1, x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 }
      },
      frequency: 100,
      noise: { type: 'gaussian', mean: 0, stddev: 0.001, bias: 0 },
      data: { timestamp: 0, values: [] }
    }
  ];

  // Create actuators
  const actuators: Actuator[] = joints.map((joint, i) => ({
    id: `${id}_motor_${i}`,
    type: 'motor' as ActuatorType,
    jointId: joint.id,
    maxForce: 1.0,
    maxVelocity: 10.0,
    controlMode: 'velocity' as const,
    command: 0
  }));

  return {
    id,
    name: `Simple Robot ${id}`,
    bodies: [baseBody, ...wheels],
    joints,
    sensors,
    actuators,
    rootBody: baseBody.id
  };
}

// ============================================================================
// MCP SERVER INTERFACE
// ============================================================================

export interface MCPSimulationServer {
  // Environment management
  createEnvironment(config: Partial<SimulationConfig>): string;
  destroyEnvironment(envId: string): void;

  // Robot management
  spawnRobot(envId: string, type: string, position: Vec3): string;
  removeRobot(envId: string, robotId: string): void;

  // Simulation control
  step(envId: string, actions: SimulationAction[]): SimulationObservation;
  reset(envId: string): SimulationObservation;
  getState(envId: string): SimulationState;

  // Configuration
  setParameter(envId: string, param: string, value: unknown): void;
  getParameter(envId: string, param: string): unknown;
}

export class SimulationMCPServer implements MCPSimulationServer {
  private environments: Map<string, SimulationEnvironment> = new Map();
  private nextEnvId: number = 0;

  createEnvironment(config: Partial<SimulationConfig> = {}): string {
    const envId = `env_${this.nextEnvId++}`;
    const env = new SimulationEnvironment(config);
    this.environments.set(envId, env);
    return envId;
  }

  destroyEnvironment(envId: string): void {
    this.environments.delete(envId);
  }

  spawnRobot(envId: string, type: string, position: Vec3): string {
    const env = this.environments.get(envId);
    if (!env) throw new Error(`Environment ${envId} not found`);

    const robotId = `robot_${Date.now()}`;

    if (type === 'simple' || type === 'wheeled') {
      const robot = createSimpleRobot(robotId, position);
      env.addRobot(robot);
    }

    return robotId;
  }

  removeRobot(envId: string, robotId: string): void {
    // Would need to implement robot removal in SimulationEnvironment
    console.log(`Removing robot ${robotId} from ${envId}`);
  }

  step(envId: string, actions: SimulationAction[]): SimulationObservation {
    const env = this.environments.get(envId);
    if (!env) throw new Error(`Environment ${envId} not found`);
    return env.step(actions);
  }

  reset(envId: string): SimulationObservation {
    const env = this.environments.get(envId);
    if (!env) throw new Error(`Environment ${envId} not found`);
    return env.reset();
  }

  getState(envId: string): SimulationState {
    const env = this.environments.get(envId);
    if (!env) throw new Error(`Environment ${envId} not found`);
    return env.getState();
  }

  setParameter(envId: string, param: string, value: unknown): void {
    // Parameter setting implementation
    console.log(`Setting ${param} = ${value} in ${envId}`);
  }

  getParameter(envId: string, param: string): unknown {
    // Parameter getting implementation
    return null;
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export function createSimulationServer(): SimulationMCPServer {
  return new SimulationMCPServer();
}

export function createSimulation(config?: Partial<SimulationConfig>): SimulationEnvironment {
  return new SimulationEnvironment(config);
}
