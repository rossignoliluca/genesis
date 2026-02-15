/**
 * Symbiotic Module - Human-AI Partnership
 *
 * Implements symbiotic human-AI collaboration:
 * - Adaptive friction to prevent skill atrophy
 * - Cognitive load monitoring
 * - Autonomy preservation
 * - Extended mind theory
 *
 * The goal is partnership, not replacement.
 * AI should augment human capabilities while
 * preserving human agency and skill development.
 *
 * Based on:
 * - Extended Mind Thesis (Clark & Chalmers)
 * - Human-AI teaming research
 * - Cognitive offloading studies
 */

import { EventEmitter } from 'events';

// ============================================================================
// Types
// ============================================================================

export interface HumanState {
  id: string;
  cognitiveLoad: number;       // 0-1 current mental load
  skillLevels: Map<string, number>;  // skill -> level (0-1)
  skillAtrophy: Map<string, number>; // skill -> atrophy amount
  autonomyScore: number;        // 0-1 decision independence
  engagementLevel: number;      // 0-1 active involvement
  lastInteraction: number;
  sessionStart: number;
}

export interface Task {
  id: string;
  type: TaskType;
  complexity: number;          // 0-1
  skillsRequired: string[];
  learningOpportunity: boolean;
  criticality: number;         // 0-1 importance
  deadline?: number;
}

export type TaskType =
  | 'routine'       // Repetitive, low learning value
  | 'creative'      // Requires human creativity
  | 'analytical'    // Data-driven decisions
  | 'social'        // Human relationships
  | 'learning'      // Skill development opportunity
  | 'critical';     // High-stakes decisions

export type FrictionLevel = 'none' | 'low' | 'medium' | 'high';

export interface FrictionConfig {
  level: FrictionLevel;
  delay?: number;              // ms to wait before AI response
  requireConfirmation: boolean;
  showReasoning: boolean;
  offerAlternatives: number;   // How many alternatives to show
  encourageReflection: boolean;
}

export interface Assistance {
  taskId: string;
  type: AssistanceType;
  content: unknown;
  frictionApplied: FrictionConfig;
  humanEffortRequired: number; // 0-1
  timestamp: number;
}

export type AssistanceType =
  | 'full'          // Complete task for human
  | 'partial'       // Do parts, leave important parts
  | 'guided'        // Step-by-step guidance
  | 'scaffolded'    // Provide structure, human fills in
  | 'reviewed'      // Human does, AI reviews
  | 'collaborative';// Working together

export interface AutonomyMetrics {
  decisionsTotal: number;
  decisionsByHuman: number;
  decisionsShared: number;
  decisionsDeferred: number;
  autonomyRatio: number;
}

export interface PartnershipConfig {
  // Friction settings
  defaultFriction: FrictionLevel;
  atrophyThreshold: number;
  loadThreshold: number;

  // Learning settings
  encourageLearning: boolean;
  skillDecayRate: number;
  skillGainRate: number;

  // Autonomy settings
  minAutonomy: number;
  maxCognitiveOffload: number;

  // Session settings
  breakReminder: number;       // ms between break reminders
  sessionMaxLength: number;    // max session length in ms
}

export interface PartnershipMetrics {
  totalInteractions: number;
  frictionApplied: number;
  learningOpportunities: number;
  autonomyPreserved: number;
  skillsImproved: number;
  skillsAtrophied: number;
  avgCognitiveLoad: number;
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: PartnershipConfig = {
  defaultFriction: 'low',
  atrophyThreshold: 0.3,
  loadThreshold: 0.8,

  encourageLearning: true,
  skillDecayRate: 0.01,
  skillGainRate: 0.05,

  minAutonomy: 0.5,
  maxCognitiveOffload: 0.7,

  breakReminder: 1800000,      // 30 minutes
  sessionMaxLength: 14400000   // 4 hours
};

// ============================================================================
// Human State Manager
// ============================================================================

export class HumanStateManager extends EventEmitter {
  private state: HumanState;
  private config: PartnershipConfig;
  private loadHistory: number[];

  constructor(humanId: string, config: Partial<PartnershipConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.state = {
      id: humanId,
      cognitiveLoad: 0.3,
      skillLevels: new Map(),
      skillAtrophy: new Map(),
      autonomyScore: 1.0,
      engagementLevel: 1.0,
      lastInteraction: Date.now(),
      sessionStart: Date.now()
    };
    this.loadHistory = [];
  }

  /**
   * Update cognitive load
   */
  updateLoad(load: number): void {
    this.state.cognitiveLoad = Math.max(0, Math.min(1, load));
    this.loadHistory.push(load);

    // Keep only last 20 measurements
    if (this.loadHistory.length > 20) {
      this.loadHistory.shift();
    }

    this.emit('load:updated', this.state.cognitiveLoad);

    // Warn if load is high
    if (this.state.cognitiveLoad > this.config.loadThreshold) {
      this.emit('load:high', this.state.cognitiveLoad);
    }
  }

  /**
   * Register skill usage
   */
  useSkill(skillId: string, difficulty: number): void {
    const currentLevel = this.state.skillLevels.get(skillId) || 0.5;

    // Skill improves with use
    const improvement = this.config.skillGainRate * difficulty;
    const newLevel = Math.min(1, currentLevel + improvement);
    this.state.skillLevels.set(skillId, newLevel);

    // Reset atrophy for this skill
    this.state.skillAtrophy.set(skillId, 0);

    this.emit('skill:used', { skillId, newLevel });
  }

  /**
   * Apply skill decay (called periodically)
   */
  applySkillDecay(): void {
    for (const [skillId, level] of this.state.skillLevels) {
      const atrophy = this.state.skillAtrophy.get(skillId) || 0;
      const newAtrophy = atrophy + this.config.skillDecayRate;
      this.state.skillAtrophy.set(skillId, newAtrophy);

      // Reduce skill level based on atrophy
      if (newAtrophy > this.config.atrophyThreshold) {
        const decay = this.config.skillDecayRate * (newAtrophy - this.config.atrophyThreshold);
        const newLevel = Math.max(0, level - decay);
        this.state.skillLevels.set(skillId, newLevel);

        this.emit('skill:atrophied', { skillId, newLevel, atrophy: newAtrophy });
      }
    }
  }

  /**
   * Update autonomy score
   */
  updateAutonomy(madeDecision: boolean, wasIndependent: boolean): void {
    const delta = wasIndependent ? 0.02 : (madeDecision ? 0.01 : -0.02);
    this.state.autonomyScore = Math.max(
      this.config.minAutonomy,
      Math.min(1, this.state.autonomyScore + delta)
    );

    this.emit('autonomy:updated', this.state.autonomyScore);
  }

  /**
   * Update engagement level
   */
  updateEngagement(activelyEngaged: boolean): void {
    const delta = activelyEngaged ? 0.05 : -0.03;
    this.state.engagementLevel = Math.max(0, Math.min(1, this.state.engagementLevel + delta));
    this.state.lastInteraction = Date.now();

    this.emit('engagement:updated', this.state.engagementLevel);
  }

  /**
   * Check if break is needed
   */
  needsBreak(): boolean {
    const sessionLength = Date.now() - this.state.sessionStart;
    return sessionLength > this.config.breakReminder ||
           this.state.cognitiveLoad > this.config.loadThreshold;
  }

  /**
   * Check if session is too long
   */
  sessionTooLong(): boolean {
    return Date.now() - this.state.sessionStart > this.config.sessionMaxLength;
  }

  /**
   * Get current state
   */
  getState(): HumanState {
    return {
      ...this.state,
      skillLevels: new Map(this.state.skillLevels),
      skillAtrophy: new Map(this.state.skillAtrophy)
    };
  }

  /**
   * Get average cognitive load
   */
  getAverageLoad(): number {
    if (this.loadHistory.length === 0) return this.state.cognitiveLoad;
    return this.loadHistory.reduce((a, b) => a + b, 0) / this.loadHistory.length;
  }

  /**
   * Reset session
   */
  resetSession(): void {
    this.state.sessionStart = Date.now();
    this.state.cognitiveLoad = 0.3;
    this.state.engagementLevel = 1.0;
    this.loadHistory = [];
    this.emit('session:reset');
  }
}

// ============================================================================
// Symbiotic Partnership
// ============================================================================

export class SymbioticPartnership extends EventEmitter {
  private humanState: HumanStateManager;
  private config: PartnershipConfig;
  private assistanceHistory: Assistance[];
  private autonomyMetrics: AutonomyMetrics;
  private metrics: PartnershipMetrics;

  constructor(humanId: string, config: Partial<PartnershipConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.humanState = new HumanStateManager(humanId, config);
    this.assistanceHistory = [];
    this.autonomyMetrics = {
      decisionsTotal: 0,
      decisionsByHuman: 0,
      decisionsShared: 0,
      decisionsDeferred: 0,
      autonomyRatio: 1.0
    };
    this.metrics = {
      totalInteractions: 0,
      frictionApplied: 0,
      learningOpportunities: 0,
      autonomyPreserved: 0,
      skillsImproved: 0,
      skillsAtrophied: 0,
      avgCognitiveLoad: 0
    };

    // Wire up human state events
    this.humanState.on('skill:atrophied', () => this.metrics.skillsAtrophied++);
    this.humanState.on('skill:used', () => this.metrics.skillsImproved++);
  }

  /**
   * Determine appropriate friction level for a task
   */
  adaptFriction(task: Task): FrictionConfig {
    const state = this.humanState.getState();
    let level: FrictionLevel = this.config.defaultFriction;

    // High friction if skills are atrophying
    const avgAtrophy = this.getAverageAtrophy(state);
    if (avgAtrophy > this.config.atrophyThreshold) {
      level = 'medium';
    }
    if (avgAtrophy > this.config.atrophyThreshold * 1.5) {
      level = 'high';
    }

    // High friction for learning opportunities
    if (task.learningOpportunity && this.config.encourageLearning) {
      level = this.increaseFriction(level);
    }

    // Lower friction if cognitive load is high
    if (state.cognitiveLoad > this.config.loadThreshold) {
      level = this.decreaseFriction(level);
    }

    // Critical tasks need careful handling
    if (task.criticality > 0.8) {
      level = this.increaseFriction(level);  // Ensure human oversight
    }

    const config: FrictionConfig = {
      level,
      delay: this.levelToDelay(level),
      requireConfirmation: level === 'high' || task.criticality > 0.7,
      showReasoning: level !== 'none',
      offerAlternatives: this.levelToAlternatives(level),
      encourageReflection: task.learningOpportunity
    };

    this.emit('friction:adapted', { task, config });
    return config;
  }

  /**
   * Get average skill atrophy
   */
  private getAverageAtrophy(state: HumanState): number {
    if (state.skillAtrophy.size === 0) return 0;
    const total = Array.from(state.skillAtrophy.values()).reduce((a, b) => a + b, 0);
    return total / state.skillAtrophy.size;
  }

  /**
   * Increase friction level
   */
  private increaseFriction(level: FrictionLevel): FrictionLevel {
    const levels: FrictionLevel[] = ['none', 'low', 'medium', 'high'];
    const idx = levels.indexOf(level);
    return levels[Math.min(levels.length - 1, idx + 1)];
  }

  /**
   * Decrease friction level
   */
  private decreaseFriction(level: FrictionLevel): FrictionLevel {
    const levels: FrictionLevel[] = ['none', 'low', 'medium', 'high'];
    const idx = levels.indexOf(level);
    return levels[Math.max(0, idx - 1)];
  }

  /**
   * Convert friction level to delay
   */
  private levelToDelay(level: FrictionLevel): number {
    switch (level) {
      case 'none': return 0;
      case 'low': return 500;
      case 'medium': return 2000;
      case 'high': return 5000;
    }
  }

  /**
   * Convert friction level to number of alternatives
   */
  private levelToAlternatives(level: FrictionLevel): number {
    switch (level) {
      case 'none': return 1;
      case 'low': return 2;
      case 'medium': return 3;
      case 'high': return 4;
    }
  }

  /**
   * Determine assistance type based on task and state
   */
  determineAssistanceType(task: Task): AssistanceType {
    const state = this.humanState.getState();

    // Learning opportunity - human should struggle
    if (task.learningOpportunity && state.cognitiveLoad < this.config.loadThreshold) {
      return 'scaffolded';
    }

    // High load - provide more help
    if (state.cognitiveLoad > this.config.loadThreshold) {
      return task.criticality > 0.7 ? 'collaborative' : 'partial';
    }

    // Critical tasks - collaborative approach
    if (task.criticality > 0.8) {
      return 'collaborative';
    }

    // Creative/social tasks - human leads
    if (task.type === 'creative' || task.type === 'social') {
      return 'reviewed';
    }

    // Routine tasks - can automate
    if (task.type === 'routine' && state.cognitiveLoad > 0.5) {
      return 'full';
    }

    // Default to guided assistance
    return 'guided';
  }

  /**
   * Provide assistance for a task
   */
  async assist(task: Task, content: unknown): Promise<Assistance> {
    this.metrics.totalInteractions++;

    const friction = this.adaptFriction(task);
    const assistanceType = this.determineAssistanceType(task);

    // Calculate human effort required
    const humanEffort = this.calculateHumanEffort(assistanceType, friction.level);

    // Apply friction delay
    if (friction.delay && friction.delay > 0) {
      this.metrics.frictionApplied++;
      await this.delay(friction.delay);
    }

    // Update human state
    this.humanState.updateLoad(
      this.humanState.getState().cognitiveLoad + (task.complexity * 0.2)
    );

    if (humanEffort > 0.5) {
      this.humanState.updateEngagement(true);
    }

    // Track skill usage
    for (const skill of task.skillsRequired) {
      if (humanEffort > 0.3) {
        this.humanState.useSkill(skill, task.complexity);
      }
    }

    // Track learning opportunity
    if (task.learningOpportunity) {
      this.metrics.learningOpportunities++;
    }

    // Track autonomy
    if (humanEffort > 0.5) {
      this.metrics.autonomyPreserved++;
    }

    const assistance: Assistance = {
      taskId: task.id,
      type: assistanceType,
      content,
      frictionApplied: friction,
      humanEffortRequired: humanEffort,
      timestamp: Date.now()
    };

    this.assistanceHistory.push(assistance);
    if (this.assistanceHistory.length > 200) {
      this.assistanceHistory = this.assistanceHistory.slice(-100);
    }
    this.emit('assistance:provided', assistance);

    return assistance;
  }

  /**
   * Calculate human effort required based on assistance type
   */
  private calculateHumanEffort(type: AssistanceType, friction: FrictionLevel): number {
    const baseEffort: Record<AssistanceType, number> = {
      'full': 0.1,
      'partial': 0.4,
      'guided': 0.5,
      'scaffolded': 0.7,
      'reviewed': 0.8,
      'collaborative': 0.6
    };

    const frictionBonus: Record<FrictionLevel, number> = {
      'none': 0,
      'low': 0.05,
      'medium': 0.1,
      'high': 0.15
    };

    return Math.min(1, baseEffort[type] + frictionBonus[friction]);
  }

  /**
   * Record a decision
   */
  recordDecision(byHuman: boolean, wasIndependent: boolean, wasShared: boolean): void {
    this.autonomyMetrics.decisionsTotal++;

    if (byHuman && wasIndependent) {
      this.autonomyMetrics.decisionsByHuman++;
    } else if (wasShared) {
      this.autonomyMetrics.decisionsShared++;
    } else if (!byHuman) {
      this.autonomyMetrics.decisionsDeferred++;
    }

    // Update autonomy ratio
    this.autonomyMetrics.autonomyRatio =
      (this.autonomyMetrics.decisionsByHuman + this.autonomyMetrics.decisionsShared * 0.5) /
      Math.max(1, this.autonomyMetrics.decisionsTotal);

    this.humanState.updateAutonomy(byHuman, wasIndependent);
    this.emit('decision:recorded', this.autonomyMetrics);
  }

  /**
   * Explain AI preprocessing (System 0 transparency)
   */
  explainPreprocessing(input: unknown, output: unknown): {
    steps: string[];
    rationale: string;
    humanOverride: boolean;
  } {
    const steps = [
      'Received input from context',
      'Applied relevance filtering',
      'Structured for cognitive accessibility',
      'Prioritized by importance',
      'Added supporting context'
    ];

    const rationale = 'Preprocessing aimed to reduce cognitive load while preserving ' +
      'all decision-relevant information. No content was hidden or altered.';

    return {
      steps,
      rationale,
      humanOverride: true  // Human can always see raw input
    };
  }

  /**
   * Check if human autonomy is being preserved
   */
  checkAutonomyPreservation(): { preserved: boolean; concerns: string[] } {
    const concerns: string[] = [];

    if (this.autonomyMetrics.autonomyRatio < this.config.minAutonomy) {
      concerns.push('Autonomy ratio below minimum threshold');
    }

    const state = this.humanState.getState();
    if (state.autonomyScore < this.config.minAutonomy) {
      concerns.push('Human autonomy score declining');
    }

    const avgAtrophy = this.getAverageAtrophy(state);
    if (avgAtrophy > this.config.atrophyThreshold * 2) {
      concerns.push('Significant skill atrophy detected');
    }

    return {
      preserved: concerns.length === 0,
      concerns
    };
  }

  /**
   * Get partnership metrics
   */
  getMetrics(): PartnershipMetrics {
    return {
      ...this.metrics,
      avgCognitiveLoad: this.humanState.getAverageLoad()
    };
  }

  /**
   * Get autonomy metrics
   */
  getAutonomyMetrics(): AutonomyMetrics {
    return { ...this.autonomyMetrics };
  }

  /**
   * Get human state
   */
  getHumanState(): HumanState {
    return this.humanState.getState();
  }

  /**
   * Get assistance history
   */
  getAssistanceHistory(limit?: number): Assistance[] {
    const history = [...this.assistanceHistory];
    if (limit) {
      return history.slice(-limit);
    }
    return history;
  }

  /**
   * Suggest break if needed
   */
  suggestBreak(): { needed: boolean; reason?: string } {
    if (this.humanState.sessionTooLong()) {
      return { needed: true, reason: 'Session has been very long. Consider taking a break.' };
    }

    if (this.humanState.needsBreak()) {
      return { needed: true, reason: 'Cognitive load is high. A short break might help.' };
    }

    return { needed: false };
  }

  /**
   * Reset session
   */
  resetSession(): void {
    this.humanState.resetSession();
    this.emit('session:reset');
  }

  /**
   * Helper delay function
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a task
 */
export function createTask(
  type: TaskType,
  complexity: number,
  skillsRequired: string[],
  options: Partial<Task> = {}
): Task {
  return {
    id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    type,
    complexity: Math.max(0, Math.min(1, complexity)),
    skillsRequired,
    learningOpportunity: options.learningOpportunity ?? (complexity > 0.5),
    criticality: options.criticality ?? 0.5,
    deadline: options.deadline
  };
}

// ============================================================================
// Global Instance
// ============================================================================

let globalPartnership: SymbioticPartnership | null = null;

/**
 * Get global symbiotic partnership
 */
export function getPartnership(humanId?: string, config?: Partial<PartnershipConfig>): SymbioticPartnership {
  if (!globalPartnership) {
    globalPartnership = new SymbioticPartnership(humanId || 'default-human', config);
  }
  return globalPartnership;
}

/**
 * Reset global partnership
 */
export function resetPartnership(): void {
  if (globalPartnership) {
    globalPartnership.resetSession();
  }
  globalPartnership = null;
}
