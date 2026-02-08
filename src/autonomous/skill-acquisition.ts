/**
 * Genesis v32.0 — Skill Acquisition System
 *
 * Enables Genesis to learn new capabilities from experience:
 * - Extracts reusable patterns from successful operations
 * - Builds procedural memory for complex multi-step tasks
 * - Tracks skill proficiency and improvement over time
 * - Identifies skill gaps from failures
 * - Suggests skill development priorities
 *
 * Inspired by:
 * - Procedural learning (Fitts & Posner stages)
 * - Skill compilation (Anderson's ACT-R)
 * - Deliberate practice theory
 *
 * @module autonomous/skill-acquisition
 * @version 32.0.0
 */

import { getEventBus } from '../bus/index.js';
import { getMemorySystem } from '../memory/index.js';
import { getSelfReflectionEngine } from './self-reflection.js';

// ============================================================================
// Types
// ============================================================================

export interface SkillConfig {
  /** Minimum executions before skill is considered learned */
  minExecutionsToLearn: number;
  /** Success rate threshold to consider skill mastered */
  masteryThreshold: number;
  /** How often to evaluate skill levels (ms) */
  evaluationInterval: number;
  /** Rate at which unused skills decay */
  skillDecayRate: number;
  /** Enable automatic skill extraction from successes */
  autoExtract: boolean;
}

export type SkillCategory =
  | 'reasoning'       // Logical reasoning, problem decomposition
  | 'coding'          // Code generation, debugging
  | 'research'        // Information gathering, synthesis
  | 'communication'   // Content creation, explanation
  | 'planning'        // Strategy, task decomposition
  | 'execution'       // Tool use, action sequences
  | 'learning'        // Meta-learning, adaptation
  | 'social';         // Collaboration, negotiation

export type SkillStage = 'novice' | 'beginner' | 'intermediate' | 'proficient' | 'expert';

export interface SkillMetrics {
  executionCount: number;
  successCount: number;
  failureCount: number;
  successRate: number;
  avgDuration: number;
  lastUsed: Date;
  firstUsed: Date;
  streak: number;  // Consecutive successes
  bestStreak: number;
}

export interface Skill {
  id: string;
  name: string;
  description: string;
  category: SkillCategory;
  stage: SkillStage;

  // Proficiency (0-1)
  proficiency: number;

  // Components
  prerequisites: string[];     // Required skills
  subskills: string[];         // Component skills
  patterns: SkillPattern[];    // Extracted action patterns

  // Metrics
  metrics: SkillMetrics;

  // Metadata
  source: 'extracted' | 'defined' | 'taught';
  tags: string[];
  context: Record<string, unknown>;

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}

export interface SkillPattern {
  id: string;
  name: string;
  trigger: string;       // Condition/context when to use
  sequence: string[];    // Ordered action descriptions
  preconditions: string[];
  postconditions: string[];
  successRate: number;
  useCount: number;
}

export interface SkillGap {
  category: SkillCategory;
  description: string;
  importance: number;
  suggestedSkills: string[];
  detectedFrom: string;  // What failure revealed this gap
  detectedAt: Date;
}

export interface SkillDevelopmentPlan {
  skillId: string;
  targetStage: SkillStage;
  currentStage: SkillStage;
  estimatedPracticeNeeded: number;  // Executions needed
  priorityScore: number;
  exercises: string[];
  dependencies: string[];
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_CONFIG: SkillConfig = {
  minExecutionsToLearn: 5,
  masteryThreshold: 0.85,
  evaluationInterval: 15 * 60 * 1000,  // 15 minutes
  skillDecayRate: 0.001,               // 0.1% per day unused
  autoExtract: true,
};

const STAGE_THRESHOLDS: Record<SkillStage, number> = {
  novice: 0,
  beginner: 0.2,
  intermediate: 0.4,
  proficient: 0.65,
  expert: 0.85,
};

// ============================================================================
// Skill Acquisition System
// ============================================================================

export class SkillAcquisitionSystem {
  private config: SkillConfig;
  private skills: Map<string, Skill> = new Map();
  private gaps: SkillGap[] = [];
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private idCounter = 0;

  constructor(config?: Partial<SkillConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.initializeCoreSkills();
    this.setupEventListeners();
  }

  // ===========================================================================
  // Initialization
  // ===========================================================================

  private initializeCoreSkills(): void {
    // Define core skills that Genesis should have
    const coreSkills: Array<{
      name: string;
      description: string;
      category: SkillCategory;
      prerequisites?: string[];
    }> = [
      // Reasoning skills
      { name: 'problem-decomposition', description: 'Break complex problems into manageable parts', category: 'reasoning' },
      { name: 'logical-inference', description: 'Draw valid conclusions from premises', category: 'reasoning' },
      { name: 'counterfactual-reasoning', description: 'Reason about hypothetical scenarios', category: 'reasoning', prerequisites: ['logical-inference'] },

      // Coding skills
      { name: 'code-generation', description: 'Generate working code from requirements', category: 'coding' },
      { name: 'debugging', description: 'Identify and fix code issues', category: 'coding' },
      { name: 'code-review', description: 'Evaluate code quality and suggest improvements', category: 'coding', prerequisites: ['code-generation'] },
      { name: 'test-writing', description: 'Create comprehensive test cases', category: 'coding', prerequisites: ['code-generation'] },

      // Research skills
      { name: 'information-retrieval', description: 'Find relevant information from sources', category: 'research' },
      { name: 'synthesis', description: 'Combine information into coherent understanding', category: 'research', prerequisites: ['information-retrieval'] },
      { name: 'fact-verification', description: 'Verify claims and ground assertions', category: 'research' },

      // Communication skills
      { name: 'explanation', description: 'Explain concepts clearly to different audiences', category: 'communication' },
      { name: 'content-creation', description: 'Create engaging written content', category: 'communication' },
      { name: 'summarization', description: 'Condense information while preserving meaning', category: 'communication' },

      // Planning skills
      { name: 'task-planning', description: 'Create actionable plans for goals', category: 'planning' },
      { name: 'resource-estimation', description: 'Estimate time and resources needed', category: 'planning' },
      { name: 'contingency-planning', description: 'Plan for potential failures', category: 'planning', prerequisites: ['task-planning'] },

      // Execution skills
      { name: 'tool-selection', description: 'Choose appropriate tools for tasks', category: 'execution' },
      { name: 'action-sequencing', description: 'Order actions for effective execution', category: 'execution' },
      { name: 'error-recovery', description: 'Recover from execution failures', category: 'execution' },

      // Learning skills
      { name: 'pattern-recognition', description: 'Identify recurring patterns in data', category: 'learning' },
      { name: 'feedback-integration', description: 'Learn from success and failure signals', category: 'learning' },
      { name: 'skill-transfer', description: 'Apply skills to new domains', category: 'learning', prerequisites: ['pattern-recognition'] },

      // Social skills
      { name: 'context-awareness', description: 'Understand social and situational context', category: 'social' },
      { name: 'collaboration', description: 'Work effectively with other agents', category: 'social' },
    ];

    for (const skillDef of coreSkills) {
      this.defineSkill({
        name: skillDef.name,
        description: skillDef.description,
        category: skillDef.category,
        prerequisites: skillDef.prerequisites || [],
      });
    }
  }

  private setupEventListeners(): void {
    const bus = getEventBus();

    // Track successful task completions for skill extraction
    bus.subscribePrefix('bounty.', (event) => {
      const topic = (event as { topic?: string }).topic || '';
      const data = event as unknown as Record<string, unknown>;

      if (topic.includes('completed')) {
        this.recordSkillUse('task-planning', true, data);
        this.recordSkillUse('action-sequencing', true, data);

        // Extract patterns if enabled
        if (this.config.autoExtract) {
          this.extractPatternFromSuccess(data);
        }
      } else if (topic.includes('failed')) {
        this.recordSkillUse('task-planning', false, data);
        this.identifySkillGap(data);
      }
    });

    // Track content creation
    bus.subscribePrefix('content.', (event) => {
      const topic = (event as { topic?: string }).topic || '';
      const data = event as unknown as Record<string, unknown>;

      if (topic.includes('published')) {
        this.recordSkillUse('content-creation', true, data);
      } else if (topic.includes('viral')) {
        // High engagement = skill proficiency
        this.boostProficiency('content-creation', 0.05);
        this.recordSkillUse('content-creation', true, data);
      }
    });

    // Track reasoning usage
    bus.subscribePrefix('decision.', (event) => {
      const topic = (event as { topic?: string }).topic || '';
      const data = event as unknown as Record<string, unknown>;

      if (topic.includes('made')) {
        this.recordSkillUse('logical-inference', true, data);
        const confidence = data.confidence as number || 0.5;
        if (confidence > 0.8) {
          this.boostProficiency('logical-inference', 0.02);
        }
      }
    });

    // Track reflection insights for learning skills
    bus.subscribePrefix('autonomous:reflection.', (event) => {
      const topic = (event as { topic?: string }).topic || '';
      const data = event as unknown as Record<string, unknown>;

      if (topic.includes('completed')) {
        this.recordSkillUse('pattern-recognition', true, data);
        this.recordSkillUse('feedback-integration', true, data);
      }
    });
  }

  // ===========================================================================
  // Skill Definition
  // ===========================================================================

  defineSkill(params: {
    name: string;
    description: string;
    category: SkillCategory;
    prerequisites?: string[];
    subskills?: string[];
    tags?: string[];
  }): Skill {
    const id = `skill-${++this.idCounter}-${params.name.replace(/\s+/g, '-').toLowerCase()}`;
    const now = new Date();

    const skill: Skill = {
      id,
      name: params.name,
      description: params.description,
      category: params.category,
      stage: 'novice',
      proficiency: 0,
      prerequisites: params.prerequisites || [],
      subskills: params.subskills || [],
      patterns: [],
      metrics: {
        executionCount: 0,
        successCount: 0,
        failureCount: 0,
        successRate: 0,
        avgDuration: 0,
        lastUsed: now,
        firstUsed: now,
        streak: 0,
        bestStreak: 0,
      },
      source: 'defined',
      tags: params.tags || [],
      context: {},
      createdAt: now,
      updatedAt: now,
    };

    this.skills.set(skill.name, skill);
    return skill;
  }

  // ===========================================================================
  // Skill Recording
  // ===========================================================================

  recordSkillUse(
    skillName: string,
    success: boolean,
    context?: Record<string, unknown>,
    duration?: number,
  ): void {
    const skill = this.skills.get(skillName);
    if (!skill) return;

    const now = new Date();

    // Update metrics
    skill.metrics.executionCount++;
    if (success) {
      skill.metrics.successCount++;
      skill.metrics.streak++;
      if (skill.metrics.streak > skill.metrics.bestStreak) {
        skill.metrics.bestStreak = skill.metrics.streak;
      }
    } else {
      skill.metrics.failureCount++;
      skill.metrics.streak = 0;
    }

    skill.metrics.successRate = skill.metrics.executionCount > 0
      ? skill.metrics.successCount / skill.metrics.executionCount
      : 0;

    if (duration) {
      const totalDuration = skill.metrics.avgDuration * (skill.metrics.executionCount - 1);
      skill.metrics.avgDuration = (totalDuration + duration) / skill.metrics.executionCount;
    }

    skill.metrics.lastUsed = now;
    skill.updatedAt = now;

    // Update proficiency based on performance
    this.updateProficiency(skill);

    // Store in procedural memory
    this.storeSkillExecution(skill, success, context);
  }

  private updateProficiency(skill: Skill): void {
    // Proficiency is a weighted combination of:
    // - Success rate (40%)
    // - Experience (30%) - logarithmic scaling
    // - Recency (20%) - decay for unused skills
    // - Streak bonus (10%)

    const successComponent = skill.metrics.successRate * 0.4;

    // Experience: log scale, caps around 100 executions
    const expNormalized = Math.min(1, Math.log10(skill.metrics.executionCount + 1) / 2);
    const experienceComponent = expNormalized * 0.3;

    // Recency: decay based on time since last use
    const daysSinceUse = (Date.now() - skill.metrics.lastUsed.getTime()) / (24 * 60 * 60 * 1000);
    const recencyComponent = Math.pow(1 - this.config.skillDecayRate, daysSinceUse) * 0.2;

    // Streak: bonus for consistent success
    const streakNormalized = Math.min(1, skill.metrics.streak / 10);
    const streakComponent = streakNormalized * 0.1;

    skill.proficiency = Math.min(1, successComponent + experienceComponent + recencyComponent + streakComponent);

    // Update stage
    skill.stage = this.proficiencyToStage(skill.proficiency);
  }

  private proficiencyToStage(proficiency: number): SkillStage {
    if (proficiency >= STAGE_THRESHOLDS.expert) return 'expert';
    if (proficiency >= STAGE_THRESHOLDS.proficient) return 'proficient';
    if (proficiency >= STAGE_THRESHOLDS.intermediate) return 'intermediate';
    if (proficiency >= STAGE_THRESHOLDS.beginner) return 'beginner';
    return 'novice';
  }

  boostProficiency(skillName: string, amount: number): void {
    const skill = this.skills.get(skillName);
    if (!skill) return;

    skill.proficiency = Math.min(1, skill.proficiency + amount);
    skill.stage = this.proficiencyToStage(skill.proficiency);
    skill.updatedAt = new Date();
  }

  // ===========================================================================
  // Pattern Extraction
  // ===========================================================================

  extractPatternFromSuccess(context: Record<string, unknown>): void {
    // Extract reusable patterns from successful operations
    const patternId = `pattern-${++this.idCounter}-${Date.now().toString(36)}`;

    const steps = context.steps as string[] || [];
    const domain = context.domain as string || 'general';
    const trigger = context.trigger as string || 'task_request';

    if (steps.length < 2) return;  // Need at least 2 steps for a pattern

    const pattern: SkillPattern = {
      id: patternId,
      name: `${domain}-pattern-${patternId.slice(-6)}`,
      trigger,
      sequence: steps,
      preconditions: [],
      postconditions: [],
      successRate: 1.0,
      useCount: 1,
    };

    // Add pattern to relevant skill
    const categoryMap: Record<string, SkillCategory> = {
      bounty: 'execution',
      content: 'communication',
      research: 'research',
      code: 'coding',
    };
    const category = categoryMap[domain] || 'execution';

    // Find best matching skill or create new one
    const matchingSkill = [...this.skills.values()].find(
      s => s.category === category && s.proficiency > 0.3
    );

    if (matchingSkill) {
      matchingSkill.patterns.push(pattern);

      this.emitEvent('skill.pattern.extracted', {
        patternId,
        skillName: matchingSkill.name,
        steps: steps.length,
      });
    }
  }

  // ===========================================================================
  // Skill Gap Analysis
  // ===========================================================================

  identifySkillGap(failureContext: Record<string, unknown>): void {
    const domain = failureContext.domain as string || 'unknown';
    const error = failureContext.error as string || 'unknown error';

    // Map failure patterns to skill categories
    let category: SkillCategory = 'execution';
    const suggestedSkills: string[] = [];

    if (error.includes('code') || error.includes('syntax') || error.includes('compile')) {
      category = 'coding';
      suggestedSkills.push('debugging', 'code-generation');
    } else if (error.includes('understand') || error.includes('complex')) {
      category = 'reasoning';
      suggestedSkills.push('problem-decomposition', 'logical-inference');
    } else if (error.includes('timeout') || error.includes('resource')) {
      category = 'planning';
      suggestedSkills.push('resource-estimation', 'task-planning');
    } else if (error.includes('recover') || error.includes('retry')) {
      category = 'execution';
      suggestedSkills.push('error-recovery', 'action-sequencing');
    }

    const gap: SkillGap = {
      category,
      description: `Gap identified in ${category} from: ${error.slice(0, 100)}`,
      importance: 0.7,
      suggestedSkills,
      detectedFrom: domain,
      detectedAt: new Date(),
    };

    this.gaps.push(gap);

    // Trim old gaps
    if (this.gaps.length > 50) {
      this.gaps = this.gaps.slice(-25);
    }

    this.emitEvent('skill.gap.identified', {
      category,
      suggestedSkills,
      importance: gap.importance,
    });
  }

  // ===========================================================================
  // Development Planning
  // ===========================================================================

  generateDevelopmentPlan(): SkillDevelopmentPlan[] {
    const plans: SkillDevelopmentPlan[] = [];

    // Analyze reflection insights for improvement areas
    try {
      const reflection = getSelfReflectionEngine();
      const insights = reflection.getInsights().filter(i => i.actionable);

      for (const insight of insights) {
        // Map insights to skills
        const relevantSkills = this.findRelevantSkills(insight.title, insight.description);
        for (const skill of relevantSkills) {
          if (skill.proficiency < this.config.masteryThreshold) {
            plans.push(this.createDevelopmentPlan(skill));
          }
        }
      }
    } catch {
      // Reflection engine not available
    }

    // Add plans for identified skill gaps
    for (const gap of this.gaps) {
      for (const skillName of gap.suggestedSkills) {
        const skill = this.skills.get(skillName);
        if (skill && skill.proficiency < this.config.masteryThreshold) {
          const existing = plans.find(p => p.skillId === skill.id);
          if (!existing) {
            plans.push(this.createDevelopmentPlan(skill, gap.importance));
          }
        }
      }
    }

    // Sort by priority
    plans.sort((a, b) => b.priorityScore - a.priorityScore);

    return plans.slice(0, 5);  // Top 5 priorities
  }

  private findRelevantSkills(title: string, description: string): Skill[] {
    const combined = `${title} ${description}`.toLowerCase();
    const relevant: Skill[] = [];

    for (const skill of this.skills.values()) {
      const skillTerms = `${skill.name} ${skill.description} ${skill.category}`.toLowerCase();
      // Simple keyword matching
      if (combined.split(/\s+/).some(word => skillTerms.includes(word))) {
        relevant.push(skill);
      }
    }

    return relevant;
  }

  private createDevelopmentPlan(skill: Skill, importanceBoost = 0): SkillDevelopmentPlan {
    const targetStage = this.getNextStage(skill.stage);
    const targetProficiency = STAGE_THRESHOLDS[targetStage];
    const proficiencyGap = targetProficiency - skill.proficiency;

    // Estimate practice needed (rough heuristic)
    const estimatedPractice = Math.ceil(proficiencyGap * 50);

    // Priority based on:
    // - Gap size
    // - Importance boost
    // - How many other skills depend on this
    const dependentCount = [...this.skills.values()].filter(
      s => s.prerequisites.includes(skill.name)
    ).length;
    const priorityScore = proficiencyGap * 0.4 + importanceBoost * 0.3 + (dependentCount * 0.05) * 0.3;

    return {
      skillId: skill.id,
      targetStage,
      currentStage: skill.stage,
      estimatedPracticeNeeded: estimatedPractice,
      priorityScore,
      exercises: this.generateExercises(skill),
      dependencies: skill.prerequisites.filter(p => {
        const prereq = this.skills.get(p);
        return prereq && prereq.stage === 'novice';
      }),
    };
  }

  private getNextStage(current: SkillStage): SkillStage {
    const stages: SkillStage[] = ['novice', 'beginner', 'intermediate', 'proficient', 'expert'];
    const idx = stages.indexOf(current);
    return stages[Math.min(idx + 1, stages.length - 1)];
  }

  private generateExercises(skill: Skill): string[] {
    const exercises: string[] = [];

    switch (skill.category) {
      case 'coding':
        exercises.push('Complete a small coding challenge');
        exercises.push('Review and refactor existing code');
        exercises.push('Write tests for a function');
        break;
      case 'reasoning':
        exercises.push('Solve a logic puzzle');
        exercises.push('Decompose a complex problem');
        exercises.push('Evaluate an argument for fallacies');
        break;
      case 'research':
        exercises.push('Synthesize information from multiple sources');
        exercises.push('Fact-check a set of claims');
        exercises.push('Create a research summary');
        break;
      case 'communication':
        exercises.push('Explain a concept to a beginner');
        exercises.push('Write content for a specific audience');
        exercises.push('Summarize a long document');
        break;
      case 'planning':
        exercises.push('Create a project plan with milestones');
        exercises.push('Estimate resources for a task');
        exercises.push('Develop contingency scenarios');
        break;
      case 'execution':
        exercises.push('Complete a multi-step task');
        exercises.push('Recover from a simulated failure');
        exercises.push('Optimize an action sequence');
        break;
      case 'learning':
        exercises.push('Identify patterns in past decisions');
        exercises.push('Apply a skill to a new domain');
        exercises.push('Reflect on recent failures');
        break;
      case 'social':
        exercises.push('Collaborate on a shared task');
        exercises.push('Navigate a context-sensitive situation');
        break;
    }

    return exercises;
  }

  // ===========================================================================
  // Memory Integration
  // ===========================================================================

  private async storeSkillExecution(
    skill: Skill,
    success: boolean,
    _context?: Record<string, unknown>,
  ): Promise<void> {
    try {
      const memory = getMemorySystem();
      const sequence = skill.patterns[0]?.sequence || [];
      // Convert string steps to proper step format
      const steps = sequence.map(action => ({ action }));

      await memory.learnSkill({
        name: `${skill.name}-execution-${Date.now()}`,
        description: `${success ? 'Successful' : 'Failed'} execution of ${skill.name}`,
        steps: steps.length > 0 ? steps : [{ action: skill.name }],
        tags: [skill.category, success ? 'success' : 'failure', ...skill.tags],
      });
    } catch {
      // Memory system not available
    }
  }

  // ===========================================================================
  // Utilities
  // ===========================================================================

  private emitEvent(topic: string, data: Record<string, unknown>): void {
    const bus = getEventBus();
    (bus as unknown as { publish: (topic: string, event: Record<string, unknown>) => void }).publish(
      `autonomous:${topic}`,
      { precision: 0.9, ...data }
    );
  }

  // ===========================================================================
  // Control
  // ===========================================================================

  start(): void {
    if (this.running) return;
    this.running = true;

    // Periodic skill evaluation and decay
    this.timer = setInterval(() => {
      this.evaluateAllSkills();
    }, this.config.evaluationInterval);

    console.log('[SkillAcquisition] Started — skill learning active');
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;

    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private evaluateAllSkills(): void {
    for (const skill of this.skills.values()) {
      this.updateProficiency(skill);
    }
  }

  // ===========================================================================
  // Getters
  // ===========================================================================

  getSkill(name: string): Skill | undefined {
    return this.skills.get(name);
  }

  getAllSkills(): Skill[] {
    return [...this.skills.values()];
  }

  getSkillsByCategory(category: SkillCategory): Skill[] {
    return [...this.skills.values()].filter(s => s.category === category);
  }

  getSkillsByStage(stage: SkillStage): Skill[] {
    return [...this.skills.values()].filter(s => s.stage === stage);
  }

  getGaps(): SkillGap[] {
    return [...this.gaps];
  }

  getStats(): {
    totalSkills: number;
    byCategory: Record<SkillCategory, number>;
    byStage: Record<SkillStage, number>;
    avgProficiency: number;
    gapsIdentified: number;
    patternsExtracted: number;
  } {
    const skills = [...this.skills.values()];

    const byCategory: Record<SkillCategory, number> = {
      reasoning: 0,
      coding: 0,
      research: 0,
      communication: 0,
      planning: 0,
      execution: 0,
      learning: 0,
      social: 0,
    };

    const byStage: Record<SkillStage, number> = {
      novice: 0,
      beginner: 0,
      intermediate: 0,
      proficient: 0,
      expert: 0,
    };

    let totalPatterns = 0;

    for (const skill of skills) {
      byCategory[skill.category]++;
      byStage[skill.stage]++;
      totalPatterns += skill.patterns.length;
    }

    return {
      totalSkills: skills.length,
      byCategory,
      byStage,
      avgProficiency: skills.length > 0
        ? skills.reduce((s, sk) => s + sk.proficiency, 0) / skills.length
        : 0,
      gapsIdentified: this.gaps.length,
      patternsExtracted: totalPatterns,
    };
  }

  getTopSkills(limit = 5): Skill[] {
    return [...this.skills.values()]
      .sort((a, b) => b.proficiency - a.proficiency)
      .slice(0, limit);
  }

  getWeakestSkills(limit = 5): Skill[] {
    return [...this.skills.values()]
      .filter(s => s.metrics.executionCount > 0)  // Only skills we've tried
      .sort((a, b) => a.proficiency - b.proficiency)
      .slice(0, limit);
  }
}

// ============================================================================
// Singleton
// ============================================================================

let skillAcquisitionInstance: SkillAcquisitionSystem | null = null;

export function getSkillAcquisitionSystem(config?: Partial<SkillConfig>): SkillAcquisitionSystem {
  if (!skillAcquisitionInstance) {
    skillAcquisitionInstance = new SkillAcquisitionSystem(config);
  }
  return skillAcquisitionInstance;
}

export function resetSkillAcquisitionSystem(): void {
  if (skillAcquisitionInstance) {
    skillAcquisitionInstance.stop();
  }
  skillAcquisitionInstance = null;
}
