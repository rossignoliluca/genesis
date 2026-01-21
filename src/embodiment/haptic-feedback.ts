/**
 * HAPTIC FEEDBACK MODEL
 *
 * Tactile sensing and feedback for embodied interaction.
 * Models touch perception, texture recognition, and force feedback.
 *
 * Features:
 * - Tactile sensor simulation
 * - Texture and material recognition
 * - Force/pressure mapping
 * - Slip detection
 * - Haptic rendering for teleoperation
 *
 * Based on:
 * - Tactile sensor models (BioTac, GelSight)
 * - Haptic perception literature
 * - Psychophysical tactile perception
 * - Force feedback control
 */

// ============================================================================
// TYPES
// ============================================================================

export interface HapticConfig {
  sensorType: TactileSensorType;
  sensorResolution: number[];       // [rows, cols] for array sensors
  samplingRate: number;             // Hz
  forceRange: { min: number; max: number };
  temperatureRange: { min: number; max: number };
  noiseLevel: number;
  textureRecognition: boolean;
  slipDetection: boolean;
}

export type TactileSensorType =
  | 'pressure_array'    // Simple pressure array
  | 'biotac'            // BioTac-like multimodal
  | 'gelsight'          // Vision-based tactile
  | 'taxel_array'       // High-density taxel array
  | 'whisker'           // Whisker-type sensors
  | 'piezoelectric';    // Piezo-based sensors

export interface TactileReading {
  timestamp: number;
  pressureMap: number[][];          // 2D pressure distribution
  normalForce: number;              // Total normal force (N)
  shearForce: Vec2;                 // Tangential forces
  temperature: number;              // Temperature (°C)
  vibration: number;                // Vibration magnitude
  electrodes?: number[];            // For BioTac-like sensors
  depth?: number[][];               // For GelSight-like sensors
}

export interface Vec2 {
  x: number;
  y: number;
}

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface ContactState {
  inContact: boolean;
  contactArea: number;              // mm²
  contactCentroid: Vec2;
  contactNormal: Vec3;
  penetrationDepth: number;
  slipping: boolean;
  slipVelocity: Vec2;
  frictionCoefficient: number;
}

export interface MaterialProperties {
  stiffness: number;                // N/mm
  damping: number;
  friction: number;
  roughness: number;                // 0-1
  temperature: number;
  conductivity: number;             // Thermal
}

export interface TextureFeatures {
  roughness: number;
  waviness: number;
  periodicity: number;
  directionality: number;
  compliance: number;
  classification?: string;
}

export interface HapticFeedback {
  force: Vec3;
  torque: Vec3;
  vibration: VibrationPattern;
  temperature?: number;
}

export interface VibrationPattern {
  frequency: number;               // Hz
  amplitude: number;               // 0-1
  duration: number;                // ms
  waveform: 'sine' | 'square' | 'sawtooth' | 'pulse';
}

export interface GraspState {
  stable: boolean;
  forceBalance: Vec3;
  graspQuality: number;            // 0-1
  slipMargin: number;              // Safety margin before slip
  objectMass?: number;
  objectStiffness?: number;
}

/**
 * GraspAnalysis for SensoriMotorLoop integration
 * Extended grasp information including slip risk
 */
export interface GraspAnalysis {
  stable: boolean;
  graspQuality: number;
  slipRisk: number;                // 0-1, probability of slip
  appliedForce: number;            // Current grip force (N)
  contactPoints: number;           // Number of fingers in contact
  forceBalance: Vec3;
  slipMargin: number;
}

/**
 * Haptic feedback command for sensorimotor loop
 */
export interface HapticFeedbackCommand {
  type: 'vibration' | 'force' | 'thermal';
  intensity: number;               // 0-1
  frequency?: number;              // Hz (for vibration)
  duration: number;                // ms
  direction?: number[];            // Force direction vector
}

// ============================================================================
// TACTILE SENSOR MODELS
// ============================================================================

export class TactileSensor {
  protected config: HapticConfig;
  protected reading: TactileReading;
  protected contactState: ContactState;
  protected noiseGenerator: () => number;

  constructor(config: Partial<HapticConfig> = {}) {
    this.config = {
      sensorType: 'pressure_array',
      sensorResolution: [16, 16],
      samplingRate: 100,
      forceRange: { min: 0, max: 50 },
      temperatureRange: { min: 15, max: 45 },
      noiseLevel: 0.02,
      textureRecognition: true,
      slipDetection: true,
      ...config
    };

    // Initialize reading
    this.reading = this.createEmptyReading();
    this.contactState = this.createEmptyContactState();

    // Noise generator
    let seed = Date.now();
    this.noiseGenerator = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      const u1 = seed / 0x7fffffff;
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      const u2 = seed / 0x7fffffff;
      return Math.sqrt(-2 * Math.log(u1 + 1e-10)) * Math.cos(2 * Math.PI * u2);
    };
  }

  protected createEmptyReading(): TactileReading {
    const [rows, cols] = this.config.sensorResolution;
    return {
      timestamp: Date.now(),
      pressureMap: Array(rows).fill(0).map(() => Array(cols).fill(0)),
      normalForce: 0,
      shearForce: { x: 0, y: 0 },
      temperature: 25,
      vibration: 0
    };
  }

  protected createEmptyContactState(): ContactState {
    return {
      inContact: false,
      contactArea: 0,
      contactCentroid: { x: 0, y: 0 },
      contactNormal: { x: 0, y: 0, z: 1 },
      penetrationDepth: 0,
      slipping: false,
      slipVelocity: { x: 0, y: 0 },
      frictionCoefficient: 0.5
    };
  }

  /**
   * Simulate contact with an object
   */
  simulateContact(
    force: Vec3,
    contactPoint: Vec2,
    contactRadius: number,
    materialProps: MaterialProperties
  ): TactileReading {
    const [rows, cols] = this.config.sensorResolution;

    // Generate pressure distribution
    const pressureMap: number[][] = [];
    const cellSizeX = 1.0 / cols;
    const cellSizeY = 1.0 / rows;
    let totalPressure = 0;

    for (let i = 0; i < rows; i++) {
      const row: number[] = [];
      for (let j = 0; j < cols; j++) {
        const cellX = (j + 0.5) * cellSizeX;
        const cellY = (i + 0.5) * cellSizeY;

        // Distance from contact point
        const dx = cellX - contactPoint.x;
        const dy = cellY - contactPoint.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        // Hertzian contact model (simplified)
        let pressure = 0;
        if (dist < contactRadius) {
          const normalizedDist = dist / contactRadius;
          pressure = force.z * (1 - normalizedDist * normalizedDist);
          pressure = Math.max(0, pressure);
        }

        // Add material-dependent response
        pressure *= (1 + materialProps.stiffness / 100);

        // Add noise
        pressure += this.noiseGenerator() * this.config.noiseLevel * this.config.forceRange.max;
        pressure = Math.max(0, Math.min(this.config.forceRange.max, pressure));

        row.push(pressure);
        totalPressure += pressure;
      }
      pressureMap.push(row);
    }

    // Compute contact area
    const contactArea = Math.PI * contactRadius * contactRadius * 100; // mm²

    // Update contact state
    this.contactState = {
      inContact: totalPressure > 0.1,
      contactArea,
      contactCentroid: contactPoint,
      contactNormal: { x: 0, y: 0, z: 1 },
      penetrationDepth: force.z / (materialProps.stiffness + 1),
      slipping: false,
      slipVelocity: { x: 0, y: 0 },
      frictionCoefficient: materialProps.friction
    };

    // Check for slip
    const tangentialForce = Math.sqrt(force.x * force.x + force.y * force.y);
    const maxFriction = materialProps.friction * force.z;
    if (tangentialForce > maxFriction * 0.9) {
      this.contactState.slipping = tangentialForce > maxFriction;
      this.contactState.slipVelocity = {
        x: force.x / (tangentialForce + 1e-6) * (tangentialForce - maxFriction),
        y: force.y / (tangentialForce + 1e-6) * (tangentialForce - maxFriction)
      };
    }

    // Compute vibration from surface texture
    const vibration = materialProps.roughness * totalPressure * 0.01;

    this.reading = {
      timestamp: Date.now(),
      pressureMap,
      normalForce: force.z,
      shearForce: { x: force.x, y: force.y },
      temperature: materialProps.temperature,
      vibration
    };

    return this.reading;
  }

  /**
   * Get current reading
   */
  getReading(): TactileReading {
    return { ...this.reading };
  }

  /**
   * Get contact state
   */
  getContactState(): ContactState {
    return { ...this.contactState };
  }

  /**
   * Clear contact
   */
  clearContact(): void {
    this.reading = this.createEmptyReading();
    this.contactState = this.createEmptyContactState();
  }
}

// ============================================================================
// BIOTAC-LIKE SENSOR
// ============================================================================

export class BioTacSensor extends TactileSensor {
  private electrodes: number[];
  private fluidPressure: number;
  private coreTemperature: number;

  constructor(config: Partial<HapticConfig> = {}) {
    super({
      ...config,
      sensorType: 'biotac',
      sensorResolution: [4, 5]  // 19 electrodes + DC pressure
    });

    this.electrodes = Array(19).fill(0);
    this.fluidPressure = 0;
    this.coreTemperature = 25;
  }

  /**
   * Simulate BioTac electrode response
   */
  simulateContact(
    force: Vec3,
    contactPoint: Vec2,
    contactRadius: number,
    materialProps: MaterialProperties
  ): TactileReading {
    // Call parent for pressure map
    const baseReading = super.simulateContact(force, contactPoint, contactRadius, materialProps);

    // Simulate 19 electrodes distributed on finger surface
    const electrodePositions = this.getElectrodePositions();

    this.electrodes = electrodePositions.map(pos => {
      const dx = pos.x - contactPoint.x;
      const dy = pos.y - contactPoint.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // Electrode response inversely related to distance
      let response = force.z * Math.exp(-dist * dist / (2 * contactRadius * contactRadius));
      response += this.noiseGenerator() * this.config.noiseLevel * 10;
      return Math.max(0, response);
    });

    // Fluid pressure (DC response)
    this.fluidPressure = force.z + this.noiseGenerator() * 0.1;

    // Temperature affected by contact
    const heatTransfer = materialProps.conductivity * (materialProps.temperature - this.coreTemperature);
    this.coreTemperature += heatTransfer * 0.01;

    baseReading.electrodes = this.electrodes;
    baseReading.temperature = this.coreTemperature;

    return baseReading;
  }

  private getElectrodePositions(): Vec2[] {
    // Approximate electrode layout on BioTac surface
    const positions: Vec2[] = [];

    // Ring electrodes (E1-E12)
    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * 2 * Math.PI;
      positions.push({
        x: 0.5 + 0.3 * Math.cos(angle),
        y: 0.5 + 0.3 * Math.sin(angle)
      });
    }

    // Inner electrodes (E13-E19)
    for (let i = 0; i < 7; i++) {
      const angle = (i / 7) * 2 * Math.PI;
      positions.push({
        x: 0.5 + 0.15 * Math.cos(angle),
        y: 0.5 + 0.15 * Math.sin(angle)
      });
    }

    return positions;
  }

  /**
   * Get electrode values
   */
  getElectrodes(): number[] {
    return [...this.electrodes];
  }

  /**
   * Get fluid pressure
   */
  getFluidPressure(): number {
    return this.fluidPressure;
  }
}

// ============================================================================
// GELSIGHT-LIKE SENSOR
// ============================================================================

export class GelSightSensor extends TactileSensor {
  private depthMap: number[][];
  private normalMap: Vec3[][];
  private markerFlow: Vec2[][];

  constructor(config: Partial<HapticConfig> = {}) {
    super({
      ...config,
      sensorType: 'gelsight',
      sensorResolution: [64, 64]  // Higher resolution for vision-based
    });

    const [rows, cols] = this.config.sensorResolution;
    this.depthMap = Array(rows).fill(0).map(() => Array(cols).fill(0));
    this.normalMap = Array(rows).fill(0).map(() =>
      Array(cols).fill(0).map(() => ({ x: 0, y: 0, z: 1 }))
    );
    this.markerFlow = Array(rows / 4).fill(0).map(() =>
      Array(cols / 4).fill(0).map(() => ({ x: 0, y: 0 }))
    );
  }

  /**
   * Simulate GelSight depth response
   */
  simulateContact(
    force: Vec3,
    contactPoint: Vec2,
    contactRadius: number,
    materialProps: MaterialProperties
  ): TactileReading {
    const [rows, cols] = this.config.sensorResolution;

    // Generate depth map from contact
    this.depthMap = [];
    const maxDepth = force.z / (materialProps.stiffness + 10);

    for (let i = 0; i < rows; i++) {
      const row: number[] = [];
      for (let j = 0; j < cols; j++) {
        const x = j / cols;
        const y = i / rows;

        const dx = x - contactPoint.x;
        const dy = y - contactPoint.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        // Gaussian indentation profile
        let depth = 0;
        if (dist < contactRadius * 1.5) {
          depth = maxDepth * Math.exp(-dist * dist / (2 * contactRadius * contactRadius * 0.25));
        }

        // Add texture
        if (materialProps.roughness > 0) {
          depth += (this.noiseGenerator() * 0.5 + 0.5) * materialProps.roughness * 0.1;
        }

        depth += this.noiseGenerator() * this.config.noiseLevel * 0.1;
        row.push(Math.max(0, depth));
      }
      this.depthMap.push(row);
    }

    // Compute normal map from depth gradient
    this.normalMap = [];
    for (let i = 0; i < rows; i++) {
      const normalRow: Vec3[] = [];
      for (let j = 0; j < cols; j++) {
        const dzdx = j > 0 && j < cols - 1
          ? (this.depthMap[i][j + 1] - this.depthMap[i][j - 1]) / 2
          : 0;
        const dzdy = i > 0 && i < rows - 1
          ? (this.depthMap[i + 1][j] - this.depthMap[i - 1][j]) / 2
          : 0;

        const mag = Math.sqrt(dzdx * dzdx + dzdy * dzdy + 1);
        normalRow.push({
          x: -dzdx / mag,
          y: -dzdy / mag,
          z: 1 / mag
        });
      }
      this.normalMap.push(normalRow);
    }

    // Simulate marker flow for shear sensing
    const markerRows = Math.floor(rows / 4);
    const markerCols = Math.floor(cols / 4);
    this.markerFlow = [];

    for (let i = 0; i < markerRows; i++) {
      const flowRow: Vec2[] = [];
      for (let j = 0; j < markerCols; j++) {
        const mx = (j + 0.5) / markerCols;
        const my = (i + 0.5) / markerRows;

        const dx = mx - contactPoint.x;
        const dy = my - contactPoint.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        // Shear causes marker displacement
        let flowX = 0;
        let flowY = 0;
        if (dist < contactRadius) {
          flowX = force.x * 0.1 * (1 - dist / contactRadius);
          flowY = force.y * 0.1 * (1 - dist / contactRadius);
        }

        flowRow.push({ x: flowX, y: flowY });
      }
      this.markerFlow.push(flowRow);
    }

    // Call parent for standard reading
    const baseReading = super.simulateContact(force, contactPoint, contactRadius, materialProps);
    baseReading.depth = this.depthMap;

    return baseReading;
  }

  /**
   * Get depth map
   */
  getDepthMap(): number[][] {
    return this.depthMap.map(row => [...row]);
  }

  /**
   * Get normal map
   */
  getNormalMap(): Vec3[][] {
    return this.normalMap.map(row => row.map(n => ({ ...n })));
  }

  /**
   * Get marker flow for shear estimation
   */
  getMarkerFlow(): Vec2[][] {
    return this.markerFlow.map(row => row.map(f => ({ ...f })));
  }
}

// ============================================================================
// TEXTURE RECOGNITION
// ============================================================================

export class TextureRecognizer {
  private featureDatabase: Map<string, TextureFeatures> = new Map();
  private historyWindow: TactileReading[] = [];
  private windowSize: number;

  constructor(windowSize: number = 10) {
    this.windowSize = windowSize;

    // Initialize with common textures
    this.featureDatabase.set('smooth', {
      roughness: 0.1, waviness: 0.1, periodicity: 0, directionality: 0, compliance: 0.3
    });
    this.featureDatabase.set('rough', {
      roughness: 0.8, waviness: 0.5, periodicity: 0.2, directionality: 0.3, compliance: 0.4
    });
    this.featureDatabase.set('ridged', {
      roughness: 0.5, waviness: 0.2, periodicity: 0.9, directionality: 0.8, compliance: 0.3
    });
    this.featureDatabase.set('soft', {
      roughness: 0.3, waviness: 0.2, periodicity: 0.1, directionality: 0.1, compliance: 0.9
    });
    this.featureDatabase.set('hard', {
      roughness: 0.2, waviness: 0.1, periodicity: 0, directionality: 0, compliance: 0.05
    });
  }

  /**
   * Add reading to history
   */
  addReading(reading: TactileReading): void {
    this.historyWindow.push(reading);
    if (this.historyWindow.length > this.windowSize) {
      this.historyWindow.shift();
    }
  }

  /**
   * Extract texture features from pressure map
   */
  extractFeatures(pressureMap: number[][]): TextureFeatures {
    const rows = pressureMap.length;
    const cols = pressureMap[0]?.length || 0;

    if (rows === 0 || cols === 0) {
      return { roughness: 0, waviness: 0, periodicity: 0, directionality: 0, compliance: 0 };
    }

    // Compute spatial statistics
    const flat = pressureMap.flat();
    const mean = flat.reduce((a, b) => a + b, 0) / flat.length;
    const variance = flat.reduce((a, b) => a + (b - mean) ** 2, 0) / flat.length;
    const std = Math.sqrt(variance);

    // Roughness: standard deviation of pressures
    const roughness = Math.min(1, std / (mean + 0.01));

    // Waviness: low-frequency variation (average local maxima)
    let waviness = 0;
    let maxCount = 0;
    for (let i = 1; i < rows - 1; i++) {
      for (let j = 1; j < cols - 1; j++) {
        const center = pressureMap[i][j];
        const neighbors = [
          pressureMap[i - 1][j], pressureMap[i + 1][j],
          pressureMap[i][j - 1], pressureMap[i][j + 1]
        ];
        if (neighbors.every(n => center >= n)) {
          waviness += center - mean;
          maxCount++;
        }
      }
    }
    waviness = maxCount > 0 ? waviness / maxCount / (mean + 0.01) : 0;
    waviness = Math.min(1, Math.abs(waviness));

    // Periodicity: autocorrelation analysis
    const periodicity = this.computePeriodicity(pressureMap);

    // Directionality: gradient analysis
    const directionality = this.computeDirectionality(pressureMap);

    // Compliance: from temporal variation
    const compliance = this.computeCompliance();

    return {
      roughness,
      waviness,
      periodicity,
      directionality,
      compliance
    };
  }

  private computePeriodicity(pressureMap: number[][]): number {
    // Simplified: check for regular patterns via autocorrelation
    const rows = pressureMap.length;
    const cols = pressureMap[0]?.length || 0;

    if (rows < 4 || cols < 4) return 0;

    // Compute 1D autocorrelation along rows
    let maxCorr = 0;
    for (let lag = 2; lag < cols / 2; lag++) {
      let corr = 0;
      let count = 0;
      for (let i = 0; i < rows; i++) {
        for (let j = 0; j < cols - lag; j++) {
          corr += pressureMap[i][j] * pressureMap[i][j + lag];
          count++;
        }
      }
      corr = count > 0 ? corr / count : 0;
      maxCorr = Math.max(maxCorr, corr);
    }

    // Normalize
    let zeroLagCorr = 0;
    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < cols; j++) {
        zeroLagCorr += pressureMap[i][j] * pressureMap[i][j];
      }
    }
    zeroLagCorr /= rows * cols;

    return zeroLagCorr > 0.01 ? maxCorr / zeroLagCorr : 0;
  }

  private computeDirectionality(pressureMap: number[][]): number {
    // Compute gradient histogram to detect dominant direction
    const rows = pressureMap.length;
    const cols = pressureMap[0]?.length || 0;

    if (rows < 2 || cols < 2) return 0;

    const gradientHist: number[] = Array(8).fill(0);  // 8 direction bins

    for (let i = 1; i < rows - 1; i++) {
      for (let j = 1; j < cols - 1; j++) {
        const gx = pressureMap[i][j + 1] - pressureMap[i][j - 1];
        const gy = pressureMap[i + 1][j] - pressureMap[i - 1][j];
        const mag = Math.sqrt(gx * gx + gy * gy);

        if (mag > 0.01) {
          let angle = Math.atan2(gy, gx);
          if (angle < 0) angle += 2 * Math.PI;
          const bin = Math.floor(angle / (Math.PI / 4)) % 8;
          gradientHist[bin] += mag;
        }
      }
    }

    // Compute entropy of histogram
    const total = gradientHist.reduce((a, b) => a + b, 0) + 1e-6;
    const probs = gradientHist.map(h => h / total);
    const entropy = -probs.reduce((sum, p) => p > 0 ? sum + p * Math.log(p) : sum, 0);
    const maxEntropy = Math.log(8);

    // Low entropy = high directionality
    return 1 - entropy / maxEntropy;
  }

  private computeCompliance(): number {
    // Estimate compliance from force-displacement relationship
    if (this.historyWindow.length < 2) return 0.5;

    const forces = this.historyWindow.map(r => r.normalForce);
    const maxForce = Math.max(...forces);
    const minForce = Math.min(...forces);
    const forceRange = maxForce - minForce;

    // More force variation = more compliant surface
    return Math.min(1, forceRange / 10);
  }

  /**
   * Classify texture
   */
  classify(features: TextureFeatures): { texture: string; confidence: number } {
    let bestMatch = 'unknown';
    let bestScore = Infinity;

    for (const [name, dbFeatures] of this.featureDatabase) {
      // Euclidean distance in feature space
      const score = Math.sqrt(
        (features.roughness - dbFeatures.roughness) ** 2 +
        (features.waviness - dbFeatures.waviness) ** 2 +
        (features.periodicity - dbFeatures.periodicity) ** 2 +
        (features.directionality - dbFeatures.directionality) ** 2 +
        (features.compliance - dbFeatures.compliance) ** 2
      );

      if (score < bestScore) {
        bestScore = score;
        bestMatch = name;
      }
    }

    const confidence = Math.exp(-bestScore);
    return { texture: bestMatch, confidence };
  }

  /**
   * Learn new texture
   */
  learnTexture(name: string, features: TextureFeatures): void {
    this.featureDatabase.set(name, features);
  }
}

// ============================================================================
// SLIP DETECTOR
// ============================================================================

export class SlipDetector {
  private history: TactileReading[] = [];
  private windowSize: number;
  private slipThreshold: number;
  private vibrationThreshold: number;

  constructor(windowSize: number = 5, slipThreshold: number = 0.5, vibrationThreshold: number = 0.1) {
    this.windowSize = windowSize;
    this.slipThreshold = slipThreshold;
    this.vibrationThreshold = vibrationThreshold;
  }

  /**
   * Update with new reading
   */
  update(reading: TactileReading): void {
    this.history.push(reading);
    if (this.history.length > this.windowSize) {
      this.history.shift();
    }
  }

  /**
   * Detect incipient slip
   */
  detectSlip(): { slipping: boolean; incipient: boolean; direction: Vec2; magnitude: number } {
    if (this.history.length < 2) {
      return { slipping: false, incipient: false, direction: { x: 0, y: 0 }, magnitude: 0 };
    }

    const current = this.history[this.history.length - 1];
    const previous = this.history[this.history.length - 2];

    // Vibration-based slip detection
    const vibrationIncrease = current.vibration - previous.vibration;
    const vibrationSlip = vibrationIncrease > this.vibrationThreshold;

    // Shear force ratio
    const shearMag = Math.sqrt(current.shearForce.x ** 2 + current.shearForce.y ** 2);
    const normalForce = current.normalForce + 0.1;
    const shearRatio = shearMag / normalForce;
    const shearSlip = shearRatio > this.slipThreshold;

    // Pressure centroid shift
    const centroidShift = this.computeCentroidShift(current.pressureMap, previous.pressureMap);
    const centroidSlip = centroidShift > 0.05;

    // Incipient slip: pre-slip indicators
    const incipient = vibrationIncrease > this.vibrationThreshold * 0.5 ||
      shearRatio > this.slipThreshold * 0.8;

    // Full slip
    const slipping = vibrationSlip || (shearSlip && centroidSlip);

    // Slip direction
    const direction: Vec2 = {
      x: current.shearForce.x / (shearMag + 0.01),
      y: current.shearForce.y / (shearMag + 0.01)
    };

    return {
      slipping,
      incipient,
      direction,
      magnitude: slipping ? shearMag : 0
    };
  }

  private computeCentroidShift(current: number[][], previous: number[][]): number {
    const computeCentroid = (map: number[][]): Vec2 => {
      let cx = 0, cy = 0, total = 0;
      for (let i = 0; i < map.length; i++) {
        for (let j = 0; j < map[i].length; j++) {
          cx += j * map[i][j];
          cy += i * map[i][j];
          total += map[i][j];
        }
      }
      return total > 0 ? { x: cx / total, y: cy / total } : { x: 0, y: 0 };
    };

    const c1 = computeCentroid(current);
    const c2 = computeCentroid(previous);

    return Math.sqrt((c1.x - c2.x) ** 2 + (c1.y - c2.y) ** 2);
  }

  /**
   * Compute required grip force increase to prevent slip
   */
  computeGripAdjustment(currentForce: number, frictionCoef: number): number {
    const slipState = this.detectSlip();

    if (!slipState.slipping && !slipState.incipient) {
      return 0;
    }

    const current = this.history[this.history.length - 1];
    const shearMag = Math.sqrt(current.shearForce.x ** 2 + current.shearForce.y ** 2);

    // Required normal force to prevent slip: F_n > F_t / μ
    const requiredForce = shearMag / (frictionCoef - 0.1);  // Safety margin
    const forceIncrease = requiredForce - currentForce;

    return Math.max(0, forceIncrease * (slipState.incipient ? 0.5 : 1.0));
  }
}

// ============================================================================
// HAPTIC FEEDBACK GENERATOR
// ============================================================================

export class HapticFeedbackGenerator {
  private maxForce: number;
  private maxVibration: number;
  private feedbackGain: number;

  constructor(maxForce: number = 10, maxVibration: number = 1, feedbackGain: number = 1) {
    this.maxForce = maxForce;
    this.maxVibration = maxVibration;
    this.feedbackGain = feedbackGain;
  }

  /**
   * Generate feedback from contact state
   */
  generateFromContact(contact: ContactState, materialProps: MaterialProperties): HapticFeedback {
    if (!contact.inContact) {
      return this.zeroFeedback();
    }

    // Force feedback proportional to penetration
    const forceMagnitude = contact.penetrationDepth * materialProps.stiffness * this.feedbackGain;
    const force: Vec3 = {
      x: contact.contactNormal.x * forceMagnitude,
      y: contact.contactNormal.y * forceMagnitude,
      z: contact.contactNormal.z * forceMagnitude
    };

    // Clamp to max
    const forceMag = Math.sqrt(force.x ** 2 + force.y ** 2 + force.z ** 2);
    if (forceMag > this.maxForce) {
      const scale = this.maxForce / forceMag;
      force.x *= scale;
      force.y *= scale;
      force.z *= scale;
    }

    // Torque from off-center contact
    const torque: Vec3 = {
      x: contact.contactCentroid.y * forceMagnitude * 0.1,
      y: -contact.contactCentroid.x * forceMagnitude * 0.1,
      z: 0
    };

    // Vibration for texture
    const vibration: VibrationPattern = {
      frequency: 100 + materialProps.roughness * 200,  // Higher roughness = higher freq
      amplitude: Math.min(this.maxVibration, materialProps.roughness * this.feedbackGain),
      duration: 50,
      waveform: 'sine'
    };

    // Add slip vibration
    if (contact.slipping) {
      vibration.frequency = 250;
      vibration.amplitude = Math.min(this.maxVibration, 0.8);
      vibration.waveform = 'sawtooth';
    }

    return {
      force,
      torque,
      vibration,
      temperature: materialProps.temperature
    };
  }

  /**
   * Generate feedback from texture exploration
   */
  generateFromTexture(features: TextureFeatures, explorationVelocity: number): HapticFeedback {
    // Vibration based on texture features
    const vibration: VibrationPattern = {
      frequency: 50 + features.roughness * 200 + features.periodicity * 100,
      amplitude: Math.min(this.maxVibration, features.roughness * explorationVelocity * 0.5),
      duration: 100,
      waveform: features.periodicity > 0.5 ? 'square' : 'sine'
    };

    // Light resistance force
    const force: Vec3 = {
      x: -explorationVelocity * features.compliance * 0.1,
      y: 0,
      z: features.compliance * 2
    };

    return {
      force,
      torque: { x: 0, y: 0, z: 0 },
      vibration
    };
  }

  /**
   * Generate slip warning feedback
   */
  generateSlipWarning(slipMagnitude: number, slipDirection: Vec2): HapticFeedback {
    const force: Vec3 = {
      x: -slipDirection.x * slipMagnitude * 2,
      y: -slipDirection.y * slipMagnitude * 2,
      z: slipMagnitude  // Suggest increasing grip
    };

    const vibration: VibrationPattern = {
      frequency: 200,
      amplitude: Math.min(this.maxVibration, slipMagnitude),
      duration: 100,
      waveform: 'pulse'
    };

    return {
      force,
      torque: { x: 0, y: 0, z: 0 },
      vibration
    };
  }

  private zeroFeedback(): HapticFeedback {
    return {
      force: { x: 0, y: 0, z: 0 },
      torque: { x: 0, y: 0, z: 0 },
      vibration: { frequency: 0, amplitude: 0, duration: 0, waveform: 'sine' }
    };
  }
}

// ============================================================================
// GRASP ANALYZER
// ============================================================================

export class GraspAnalyzer {
  private contacts: Map<string, ContactState> = new Map();
  private objectMass: number = 0;
  private gravity: Vec3 = { x: 0, y: -9.81, z: 0 };

  /**
   * Update contact for a finger
   */
  updateContact(fingerId: string, contact: ContactState): void {
    this.contacts.set(fingerId, contact);
  }

  /**
   * Set object mass
   */
  setObjectMass(mass: number): void {
    this.objectMass = mass;
  }

  /**
   * Analyze grasp stability
   */
  analyzeGrasp(): GraspState {
    const activeContacts = Array.from(this.contacts.values()).filter(c => c.inContact);

    if (activeContacts.length < 2) {
      return {
        stable: false,
        forceBalance: { x: 0, y: 0, z: 0 },
        graspQuality: 0,
        slipMargin: 0
      };
    }

    // Compute total contact force
    const totalForce: Vec3 = { x: 0, y: 0, z: 0 };
    let totalNormalForce = 0;
    let totalTangentialForce = 0;
    let minFriction = Infinity;

    for (const contact of activeContacts) {
      // Normal force along contact normal
      const normalMag = contact.penetrationDepth * 100;  // Simplified
      totalForce.x += contact.contactNormal.x * normalMag;
      totalForce.y += contact.contactNormal.y * normalMag;
      totalForce.z += contact.contactNormal.z * normalMag;

      totalNormalForce += normalMag;
      totalTangentialForce += Math.sqrt(contact.slipVelocity.x ** 2 + contact.slipVelocity.y ** 2);
      minFriction = Math.min(minFriction, contact.frictionCoefficient);
    }

    // Required force to support object weight
    const requiredForce = this.objectMass * Math.abs(this.gravity.y);

    // Force balance error
    const forceBalance: Vec3 = {
      x: totalForce.x,
      y: totalForce.y + requiredForce,
      z: totalForce.z
    };

    const balanceError = Math.sqrt(
      forceBalance.x ** 2 + forceBalance.y ** 2 + forceBalance.z ** 2
    );

    // Grasp quality metrics
    const forceBalanceQuality = Math.exp(-balanceError / requiredForce);

    // Force closure approximation
    const hasForceClosure = this.checkForceClosure(activeContacts);

    // Slip margin
    const maxTangential = totalNormalForce * minFriction;
    const slipMargin = maxTangential > 0
      ? (maxTangential - totalTangentialForce) / maxTangential
      : 0;

    // Grasp quality (weighted combination)
    const graspQuality = 0.4 * forceBalanceQuality +
      0.3 * (hasForceClosure ? 1 : 0) +
      0.3 * Math.max(0, slipMargin);

    const stable = graspQuality > 0.5 &&
      !activeContacts.some(c => c.slipping) &&
      slipMargin > 0.1;

    return {
      stable,
      forceBalance,
      graspQuality,
      slipMargin,
      objectMass: this.objectMass
    };
  }

  private checkForceClosure(contacts: ContactState[]): boolean {
    // Simplified force closure check
    // Real implementation would use convex hull of wrench space

    if (contacts.length < 3) return false;

    // Check if contact normals span the space (antipodal check)
    const normals = contacts.map(c => c.contactNormal);

    // Check for opposing normals
    for (let i = 0; i < normals.length; i++) {
      for (let j = i + 1; j < normals.length; j++) {
        const dot = normals[i].x * normals[j].x +
          normals[i].y * normals[j].y +
          normals[i].z * normals[j].z;

        // Opposing normals (angle > 90°)
        if (dot < -0.5) return true;
      }
    }

    return false;
  }

  /**
   * Suggest grasp adjustment
   */
  suggestAdjustment(): {
    forceAdjustments: Map<string, number>;
    positionAdjustments: Map<string, Vec2>;
  } {
    const forceAdj = new Map<string, number>();
    const posAdj = new Map<string, Vec2>();

    const graspState = this.analyzeGrasp();

    for (const [fingerId, contact] of this.contacts) {
      // Increase force if slipping
      if (contact.slipping || graspState.slipMargin < 0.2) {
        forceAdj.set(fingerId, 0.5);  // Increase by 50%
      }

      // Adjust position if grasp is unstable
      if (!graspState.stable) {
        // Move toward center
        posAdj.set(fingerId, {
          x: -contact.contactCentroid.x * 0.1,
          y: -contact.contactCentroid.y * 0.1
        });
      }
    }

    return { forceAdjustments: forceAdj, positionAdjustments: posAdj };
  }
}

// ============================================================================
// HAPTIC SYSTEM
// ============================================================================

export class HapticSystem {
  private sensors: Map<string, TactileSensor> = new Map();
  private textureRecognizer: TextureRecognizer;
  private slipDetector: SlipDetector;
  private feedbackGenerator: HapticFeedbackGenerator;
  private graspAnalyzer: GraspAnalyzer;

  constructor(numFingers: number = 5, sensorType: TactileSensorType = 'pressure_array') {
    this.textureRecognizer = new TextureRecognizer();
    this.slipDetector = new SlipDetector();
    this.feedbackGenerator = new HapticFeedbackGenerator();
    this.graspAnalyzer = new GraspAnalyzer();

    // Create sensors for each finger
    for (let i = 0; i < numFingers; i++) {
      const sensor = this.createSensor(sensorType);
      this.sensors.set(`finger_${i}`, sensor);
    }
  }

  private createSensor(type: TactileSensorType): TactileSensor {
    switch (type) {
      case 'biotac':
        return new BioTacSensor();
      case 'gelsight':
        return new GelSightSensor();
      default:
        return new TactileSensor({ sensorType: type });
    }
  }

  /**
   * Process contact for a finger
   */
  processContact(
    fingerId: string,
    force: Vec3,
    contactPoint: Vec2,
    contactRadius: number,
    material: MaterialProperties
  ): {
    reading: TactileReading;
    texture: TextureFeatures;
    slip: { slipping: boolean; incipient: boolean };
    feedback: HapticFeedback;
  } {
    const sensor = this.sensors.get(fingerId);
    if (!sensor) {
      throw new Error(`Unknown finger: ${fingerId}`);
    }

    // Get tactile reading
    const reading = sensor.simulateContact(force, contactPoint, contactRadius, material);
    const contactState = sensor.getContactState();

    // Update grasp analyzer
    this.graspAnalyzer.updateContact(fingerId, contactState);

    // Texture recognition
    this.textureRecognizer.addReading(reading);
    const texture = this.textureRecognizer.extractFeatures(reading.pressureMap);

    // Slip detection
    this.slipDetector.update(reading);
    const slipState = this.slipDetector.detectSlip();

    // Generate feedback
    let feedback = this.feedbackGenerator.generateFromContact(contactState, material);

    // Add slip warning if needed
    if (slipState.incipient || slipState.slipping) {
      const slipFeedback = this.feedbackGenerator.generateSlipWarning(
        slipState.magnitude,
        slipState.direction
      );
      // Combine feedbacks
      feedback = {
        force: {
          x: feedback.force.x + slipFeedback.force.x,
          y: feedback.force.y + slipFeedback.force.y,
          z: feedback.force.z + slipFeedback.force.z
        },
        torque: feedback.torque,
        vibration: slipFeedback.vibration  // Override with slip warning
      };
    }

    return {
      reading,
      texture,
      slip: { slipping: slipState.slipping, incipient: slipState.incipient },
      feedback
    };
  }

  /**
   * Analyze grasp
   */
  analyzeGrasp(objectMass: number): GraspState {
    this.graspAnalyzer.setObjectMass(objectMass);
    return this.graspAnalyzer.analyzeGrasp();
  }

  /**
   * Classify texture
   */
  classifyTexture(fingerId: string): { texture: string; confidence: number } {
    const sensor = this.sensors.get(fingerId);
    if (!sensor) {
      return { texture: 'unknown', confidence: 0 };
    }

    const reading = sensor.getReading();
    const features = this.textureRecognizer.extractFeatures(reading.pressureMap);
    return this.textureRecognizer.classify(features);
  }

  /**
   * Get all sensor readings as Map (legacy)
   */
  getAllReadingsMap(): Map<string, TactileReading> {
    const readings = new Map<string, TactileReading>();
    for (const [id, sensor] of this.sensors) {
      readings.set(id, sensor.getReading());
    }
    return readings;
  }

  /**
   * Get all sensor readings as array (for SensoriMotorLoop)
   */
  getAllReadings(): TactileReading[] {
    const readings: TactileReading[] = [];
    for (const sensor of this.sensors.values()) {
      readings.push(sensor.getReading());
    }
    return readings;
  }

  /**
   * Get current grasp analysis (for SensoriMotorLoop)
   * @returns GraspAnalysis with slip risk and contact info
   */
  getGraspAnalysis(): GraspAnalysis | null {
    const contacts = Array.from(this.sensors.values())
      .map(s => s.getContactState())
      .filter(c => c.inContact);

    if (contacts.length === 0) {
      return null;
    }

    // Use internal grasp analyzer
    const graspState = this.graspAnalyzer.analyzeGrasp();

    // Calculate slip risk from all contacts
    const slipRisks: number[] = contacts.map(c =>
      c.slipping ? 1.0 : c.slipVelocity.x !== 0 ? 0.5 : 0.0
    );
    const avgSlipRisk = slipRisks.reduce((a, b) => a + b, 0) / slipRisks.length;

    // Calculate applied force
    const appliedForce = contacts.reduce((sum, c) => sum + c.penetrationDepth * 100, 0);

    return {
      stable: graspState.stable,
      graspQuality: graspState.graspQuality,
      slipRisk: 1 - graspState.slipMargin,  // Convert margin to risk
      appliedForce,
      contactPoints: contacts.length,
      forceBalance: graspState.forceBalance,
      slipMargin: graspState.slipMargin,
    };
  }

  /**
   * Generate haptic feedback (for SensoriMotorLoop)
   * @param feedback - Feedback parameters
   */
  async generateFeedback(feedback: HapticFeedbackCommand): Promise<void> {
    // Simulate haptic actuator response
    const { type, intensity, frequency, duration } = feedback;

    if (type === 'vibration' && frequency) {
      // Vibration feedback - would drive vibration motor
      const pattern: VibrationPattern = {
        frequency,
        amplitude: intensity,
        duration,
        waveform: 'sine',
      };
      // In real hardware, this would send to haptic actuator
      // For simulation, we just log and emit event
      this.lastFeedback = { type, intensity, frequency, duration };
    } else if (type === 'force' && feedback.direction) {
      // Force feedback - would apply force vector
      const force: Vec3 = {
        x: (feedback.direction[0] || 0) * intensity,
        y: (feedback.direction[1] || 0) * intensity,
        z: (feedback.direction[2] || 0) * intensity,
      };
      this.lastFeedback = { type, intensity, direction: feedback.direction, duration };
    } else if (type === 'thermal') {
      // Thermal feedback
      this.lastFeedback = { type, intensity, duration };
    }
  }

  private lastFeedback?: HapticFeedbackCommand;

  /**
   * Get last generated feedback (for testing)
   */
  getLastFeedback(): HapticFeedbackCommand | undefined {
    return this.lastFeedback;
  }

  /**
   * Clear all contacts
   */
  clearContacts(): void {
    for (const sensor of this.sensors.values()) {
      sensor.clearContact();
    }
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export function createHapticSystem(numFingers?: number, sensorType?: TactileSensorType): HapticSystem {
  return new HapticSystem(numFingers, sensorType);
}

export function createTactileSensor(config?: Partial<HapticConfig>): TactileSensor {
  return new TactileSensor(config);
}

export function createBioTacSensor(config?: Partial<HapticConfig>): BioTacSensor {
  return new BioTacSensor(config);
}

export function createGelSightSensor(config?: Partial<HapticConfig>): GelSightSensor {
  return new GelSightSensor(config);
}

export function createTextureRecognizer(windowSize?: number): TextureRecognizer {
  return new TextureRecognizer(windowSize);
}

export function createSlipDetector(): SlipDetector {
  return new SlipDetector();
}

export function createGraspAnalyzer(): GraspAnalyzer {
  return new GraspAnalyzer();
}
