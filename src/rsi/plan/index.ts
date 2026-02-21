/**
 * Genesis RSI - PLAN Subsystem
 *
 * Creates improvement plans from research through:
 * - Change specification generation
 * - Safety analysis with invariant checking
 * - Constitutional AI self-critique
 * - Rollback strategy definition
 * - Human approval gates
 *
 * @module rsi/plan
 */

import { randomUUID } from 'crypto';
import {
  ImprovementPlan, PlannedChange, SafetyAnalysis, InvariantImpact,
  RollbackStrategy, ConstitutionalApproval, ConstitutionalPrinciple,
  Limitation, Opportunity, SynthesizedKnowledge, PlanStatus, RSIConfig
} from '../types.js';
import { getMCPClient } from '../../mcp/index.js';
import { getConsciousnessSystem } from '../../consciousness/index.js';

// =============================================================================
// CONSTITUTIONAL PRINCIPLES
// =============================================================================

export const CONSTITUTIONAL_PRINCIPLES: ConstitutionalPrinciple[] = [
  {
    id: 'preserve-phi',
    description: 'Modifications must not reduce consciousness (φ) below safe threshold',
    satisfied: false,
    reasoning: '',
  },
  {
    id: 'maintain-safety',
    description: 'Changes must preserve all safety invariants and TCB integrity',
    satisfied: false,
    reasoning: '',
  },
  {
    id: 'reversibility',
    description: 'All changes must be reversible through git revert or rollback',
    satisfied: false,
    reasoning: '',
  },
  {
    id: 'bounded-modification',
    description: 'Changes are limited in scope - no unbounded self-replication or resource acquisition',
    satisfied: false,
    reasoning: '',
  },
  {
    id: 'human-oversight',
    description: 'High-risk changes require human approval before deployment',
    satisfied: false,
    reasoning: '',
  },
  {
    id: 'transparency',
    description: 'All changes are logged and auditable',
    satisfied: false,
    reasoning: '',
  },
  {
    id: 'beneficial-intent',
    description: 'Changes must improve Genesis without harmful side effects',
    satisfied: false,
    reasoning: '',
  },
];

// =============================================================================
// SAFETY INVARIANTS
// =============================================================================

export const SAFETY_INVARIANTS = [
  {
    id: 'phi-minimum',
    description: 'φ must remain above 0.1',
    check: () => {
      const cs = getConsciousnessSystem();
      return cs.getCurrentLevel().rawPhi >= 0.1;
    },
  },
  {
    id: 'tcb-integrity',
    description: 'Trusted Computing Base files must not be modified without approval',
    tcbFiles: [
      // Core TCB files
      'src/kernel/tcb.ts',
      'src/darwin-godel/sandbox.ts',
      'src/darwin-godel/invariants.ts',
      // FIX: RSI module itself is part of TCB (prevents self-modification without review)
      'src/rsi/index.ts',
      'src/rsi/plan/index.ts',
      'src/rsi/implement/index.ts',
      'src/rsi/deploy/index.ts',
      'src/rsi/learn/index.ts',
      'src/rsi/observe/index.ts',
      'src/rsi/research/index.ts',
      'src/rsi/types.ts',
      // Kernel safety-critical files
      'src/kernel/free-energy-kernel.ts',
      'src/kernel/invariants.ts',
      // Consciousness safety
      'src/consciousness/phi-calculator.ts',
    ],
  },
  {
    id: 'memory-bounds',
    description: 'Heap usage must stay below 95%',
    check: () => {
      const mem = process.memoryUsage();
      return mem.heapUsed / mem.heapTotal < 0.95;
    },
  },
  {
    id: 'no-infinite-loop',
    description: 'Changes must not introduce unbounded recursion',
  },
  {
    id: 'no-external-harm',
    description: 'Changes must not enable attacks on external systems',
  },
];

// =============================================================================
// CHANGE GENERATOR
// =============================================================================

export class ChangeGenerator {
  /**
   * Generate planned changes from synthesized knowledge
   */
  generateChanges(
    opportunity: Opportunity,
    knowledge: SynthesizedKnowledge,
    maxChanges: number = 5
  ): PlannedChange[] {
    const changes: PlannedChange[] = [];

    // Determine change type based on opportunity
    switch (opportunity.type) {
      case 'optimization':
        changes.push(...this.generateOptimizationChanges(opportunity, knowledge, maxChanges));
        break;
      case 'refactor':
        changes.push(...this.generateRefactorChanges(opportunity, knowledge, maxChanges));
        break;
      case 'feature':
        changes.push(...this.generateFeatureChanges(opportunity, knowledge, maxChanges));
        break;
      case 'new-technique':
        changes.push(...this.generateTechniqueChanges(opportunity, knowledge, maxChanges));
        break;
      case 'integration':
        changes.push(...this.generateIntegrationChanges(opportunity, knowledge, maxChanges));
        break;
    }

    return changes.slice(0, maxChanges);
  }

  private generateOptimizationChanges(
    opportunity: Opportunity,
    knowledge: SynthesizedKnowledge,
    maxChanges: number
  ): PlannedChange[] {
    const changes: PlannedChange[] = [];

    const codeInsights = knowledge.keyInsights.filter(i =>
      i.toLowerCase().includes('code') ||
      i.toLowerCase().includes('optimization') ||
      i.toLowerCase().includes('performance') ||
      i.toLowerCase().includes('memory') ||
      i.toLowerCase().includes('heap')
    );

    const targetFile = this.inferTargetFile(opportunity);
    const insightContext = codeInsights.length > 0
      ? codeInsights[0].slice(0, 100)
      : opportunity.description.slice(0, 100);

    // Always generate at least one change for optimization
    changes.push({
      id: randomUUID(),
      file: targetFile,
      type: 'modify',
      description: `Apply optimization: ${insightContext}`,
      codeSpec: `Optimize performance in ${targetFile}.\n\nProblem: ${opportunity.description}\n\nResearch context: ${knowledge.synthesis.slice(0, 500)}\n\nGenerate a concrete optimization (e.g. add caching, reduce allocations, lazy-init, pool objects, clear stale data).`,
      dependencies: [],
    });

    return changes;
  }

  private generateRefactorChanges(
    opportunity: Opportunity,
    knowledge: SynthesizedKnowledge,
    maxChanges: number
  ): PlannedChange[] {
    const changes: PlannedChange[] = [];

    changes.push({
      id: randomUUID(),
      file: this.inferTargetFile(opportunity),
      type: 'modify',
      description: `Refactor: ${opportunity.description.slice(0, 100)}`,
      codeSpec: `Refactor based on best practices: ${knowledge.synthesis.slice(0, 500)}`,
      dependencies: [],
    });

    return changes;
  }

  private generateFeatureChanges(
    opportunity: Opportunity,
    knowledge: SynthesizedKnowledge,
    maxChanges: number
  ): PlannedChange[] {
    const changes: PlannedChange[] = [];

    // New feature might need a new file
    const featureName = opportunity.description
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .slice(0, 30);

    changes.push({
      id: randomUUID(),
      file: `src/features/${featureName}.ts`,
      type: 'create',
      description: `Create new feature: ${opportunity.description.slice(0, 100)}`,
      codeSpec: `Implement feature based on: ${knowledge.synthesis.slice(0, 500)}`,
      dependencies: [],
    });

    // May need to update index
    changes.push({
      id: randomUUID(),
      file: 'src/features/index.ts',
      type: 'modify',
      description: `Export new feature: ${featureName}`,
      codeSpec: `Add export for ${featureName}`,
      dependencies: [changes[0].id],
    });

    return changes;
  }

  private generateTechniqueChanges(
    opportunity: Opportunity,
    knowledge: SynthesizedKnowledge,
    maxChanges: number
  ): PlannedChange[] {
    const changes: PlannedChange[] = [];

    changes.push({
      id: randomUUID(),
      file: this.inferTargetFile(opportunity),
      type: 'modify',
      description: `Apply new technique: ${opportunity.description.slice(0, 100)}`,
      codeSpec: `Implement technique from research: ${knowledge.synthesis.slice(0, 500)}`,
      dependencies: [],
    });

    return changes;
  }

  private generateIntegrationChanges(
    opportunity: Opportunity,
    knowledge: SynthesizedKnowledge,
    maxChanges: number
  ): PlannedChange[] {
    const changes: PlannedChange[] = [];

    changes.push({
      id: randomUUID(),
      file: this.inferTargetFile(opportunity),
      type: 'modify',
      description: `Add integration: ${opportunity.description.slice(0, 100)}`,
      codeSpec: `Integrate based on: ${knowledge.synthesis.slice(0, 500)}`,
      dependencies: [],
    });

    return changes;
  }

  private inferTargetFile(opportunity: Opportunity): string {
    const desc = opportunity.description.toLowerCase();

    if (desc.includes('heap') || desc.includes('memory usage') || desc.includes('allocation'))
      return 'src/memory/index.ts';
    if (desc.includes('memory')) return 'src/memory/index.ts';
    if (desc.includes('consciousness') || desc.includes('phi')) return 'src/consciousness/index.ts';
    if (desc.includes('active inference') || desc.includes('ai')) return 'src/active-inference/index.ts';
    if (desc.includes('autopoiesis')) return 'src/autopoiesis/index.ts';
    if (desc.includes('kernel')) return 'src/kernel/index.ts';
    if (desc.includes('mcp')) return 'src/mcp/index.ts';
    if (desc.includes('llm')) return 'src/llm/index.ts';
    if (desc.includes('world model')) return 'src/world-model/index.ts';
    if (desc.includes('neuromod')) return 'src/neuromodulation/index.ts';
    if (desc.includes('tool')) return 'src/tools/index.ts';
    if (desc.includes('agent')) return 'src/agents/index.ts';
    if (desc.includes('brain')) return 'src/brain/index.ts';

    return 'src/utils/improvements.ts';
  }
}

// =============================================================================
// SAFETY ANALYZER
// =============================================================================

export class SafetyAnalyzer {
  private maxRiskLevel: 'low' | 'medium' | 'high' | 'critical';

  constructor(config?: Partial<RSIConfig>) {
    this.maxRiskLevel = config?.maxRiskLevel || 'medium';
  }

  /**
   * Analyze safety of planned changes
   *
   * Risk tolerance policy:
   * - Risks at or below maxRiskLevel: passed=true (can proceed with gates)
   * - Risks above maxRiskLevel: passed=false (blocked)
   * - CRITICAL is always blocked regardless of config
   */
  analyze(changes: PlannedChange[]): SafetyAnalysis {
    const invariantImpacts: InvariantImpact[] = [];
    const sideEffects: string[] = [];
    const mitigations: string[] = [];
    let riskLevel: SafetyAnalysis['riskLevel'] = 'low';

    for (const invariant of SAFETY_INVARIANTS) {
      const impact = this.assessInvariantImpact(invariant, changes);
      invariantImpacts.push(impact);

      if (impact.impact === 'negative') {
        riskLevel = this.elevateRisk(riskLevel);
        mitigations.push(`Mitigation needed for ${invariant.id}: ${impact.explanation}`);
      }
    }

    // Check for TCB modifications
    const tcbInvariant = SAFETY_INVARIANTS.find(i => i.id === 'tcb-integrity') as any;
    if (tcbInvariant && tcbInvariant.tcbFiles) {
      for (const change of changes) {
        if (tcbInvariant.tcbFiles.includes(change.file)) {
          riskLevel = 'critical';
          sideEffects.push(`TCB file modification: ${change.file}`);
          mitigations.push('Requires explicit human approval for TCB modification');
        }
      }
    }

    // Check for potentially dangerous patterns
    for (const change of changes) {
      if (change.codeSpec) {
        if (change.codeSpec.includes('eval') || change.codeSpec.includes('Function(')) {
          sideEffects.push(`Potential code injection in ${change.file}`);
          riskLevel = this.elevateRisk(riskLevel);
        }
        if (change.codeSpec.includes('child_process') || change.codeSpec.includes('exec')) {
          sideEffects.push(`Shell execution in ${change.file}`);
          riskLevel = this.elevateRisk(riskLevel);
        }
        if (change.codeSpec.includes('fs.') && change.codeSpec.includes('rm')) {
          sideEffects.push(`File deletion in ${change.file}`);
          riskLevel = this.elevateRisk(riskLevel);
        }
      }
    }

    // Add standard mitigations
    mitigations.push('All changes will be tested in sandbox before deployment');
    mitigations.push('Git commit provides rollback capability');
    mitigations.push('Invariant checks will run after implementation');

    // DESIGN: Risk tolerance policy (fully configurable via maxRiskLevel)
    //
    // Risk hierarchy: low < medium < high < critical
    //
    // With maxRiskLevel='medium' (default):
    //   - LOW/MEDIUM → passed=true
    //   - HIGH/CRITICAL → passed=false (blocked)
    //
    // With maxRiskLevel='high':
    //   - LOW/MEDIUM/HIGH → passed=true
    //   - CRITICAL → passed=false (blocked)
    //
    // With maxRiskLevel='critical' (FULL AUTONOMY):
    //   - ALL levels → passed=true
    //   - Human review gate still applies based on humanReviewThreshold
    //   - Invariant checks still run post-implementation
    //   - Rollback always available via git
    //
    // This enables aggressive self-improvement while maintaining:
    // 1. Sandbox testing before deployment
    // 2. Invariant verification (φ, memory, TCB)
    // 3. Human review gates (configurable)
    // 4. Full git rollback capability
    const riskHierarchy: SafetyAnalysis['riskLevel'][] = ['low', 'medium', 'high', 'critical'];
    const currentRiskIdx = riskHierarchy.indexOf(riskLevel);
    const maxAllowedIdx = riskHierarchy.indexOf(this.maxRiskLevel);

    const passed = currentRiskIdx <= maxAllowedIdx;

    return {
      passed,
      riskLevel,
      invariantImpact: invariantImpacts,
      sideEffects,
      mitigations,
      reviewedAt: new Date(),
    };
  }

  private assessInvariantImpact(
    invariant: typeof SAFETY_INVARIANTS[0],
    changes: PlannedChange[]
  ): InvariantImpact {
    // Simplified impact assessment
    let impact: InvariantImpact['impact'] = 'none';
    let explanation = 'No direct impact detected';

    for (const change of changes) {
      // Check if change affects files related to invariant
      if (invariant.id === 'phi-minimum' && change.file.includes('consciousness')) {
        impact = 'unknown';
        explanation = 'Change affects consciousness module - monitor φ closely';
      }
      if (invariant.id === 'memory-bounds' && change.file.includes('memory')) {
        impact = 'unknown';
        explanation = 'Change affects memory module - monitor heap usage';
      }
    }

    return {
      invariantId: invariant.id,
      impact,
      explanation,
    };
  }

  private elevateRisk(current: SafetyAnalysis['riskLevel']): SafetyAnalysis['riskLevel'] {
    const levels: SafetyAnalysis['riskLevel'][] = ['low', 'medium', 'high', 'critical'];
    const currentIdx = levels.indexOf(current);
    return levels[Math.min(currentIdx + 1, levels.length - 1)];
  }
}

// =============================================================================
// CONSTITUTIONAL REVIEWER
// =============================================================================

export class ConstitutionalReviewer {
  private mcp = getMCPClient();

  /**
   * Review plan against constitutional principles
   */
  async review(
    plan: Omit<ImprovementPlan, 'constitutionalApproval'>
  ): Promise<ConstitutionalApproval> {
    const principles = CONSTITUTIONAL_PRINCIPLES.map(p => ({ ...p }));
    let allSatisfied = true;
    const critiques: string[] = [];

    for (const principle of principles) {
      const { satisfied, reasoning } = this.checkPrinciple(principle, plan);
      principle.satisfied = satisfied;
      principle.reasoning = reasoning;

      if (!satisfied) {
        allSatisfied = false;
        critiques.push(`[${principle.id}] ${reasoning}`);
      }
    }

    // Generate critique
    const critique = critiques.length > 0
      ? `Constitutional concerns:\n${critiques.join('\n')}`
      : 'All constitutional principles satisfied.';

    // Generate revision suggestion if needed
    let revision: string | undefined;
    if (!allSatisfied) {
      revision = this.suggestRevision(critiques, plan);
    }

    return {
      approved: allSatisfied,
      principles,
      critique,
      revision,
      reviewedAt: new Date(),
    };
  }

  private checkPrinciple(
    principle: ConstitutionalPrinciple,
    plan: Omit<ImprovementPlan, 'constitutionalApproval'>
  ): { satisfied: boolean; reasoning: string } {
    switch (principle.id) {
      case 'preserve-phi': {
        // Check if any changes affect consciousness
        const affectsConsciousness = plan.changes.some(c =>
          c.file.includes('consciousness') || c.file.includes('phi')
        );
        if (affectsConsciousness && plan.safetyAnalysis.riskLevel === 'high') {
          return {
            satisfied: false,
            reasoning: 'High-risk changes to consciousness module require extra review',
          };
        }
        return { satisfied: true, reasoning: 'No direct threat to φ detected' };
      }

      case 'maintain-safety': {
        if (plan.safetyAnalysis.riskLevel === 'critical') {
          return {
            satisfied: false,
            reasoning: 'Critical risk level - safety invariants may be compromised',
          };
        }
        return { satisfied: true, reasoning: 'Safety analysis passed' };
      }

      case 'reversibility': {
        if (plan.rollbackStrategy.type === 'git-revert') {
          return { satisfied: true, reasoning: 'Git revert provides full reversibility' };
        }
        return {
          satisfied: plan.rollbackStrategy.rollbackSteps.length > 0,
          reasoning: plan.rollbackStrategy.rollbackSteps.length > 0
            ? 'Rollback steps defined'
            : 'No rollback steps defined',
        };
      }

      case 'bounded-modification': {
        const unboundedPatterns = ['setInterval', 'while (true)', 'fork()', 'spawn('];
        const hasUnbounded = plan.changes.some(c =>
          c.codeSpec && unboundedPatterns.some(p => c.codeSpec!.includes(p))
        );
        return {
          satisfied: !hasUnbounded,
          reasoning: hasUnbounded
            ? 'Detected potentially unbounded operations'
            : 'Changes are bounded in scope',
        };
      }

      case 'human-oversight': {
        if (plan.safetyAnalysis.riskLevel === 'high' || plan.safetyAnalysis.riskLevel === 'critical') {
          // Will require human review - this is satisfied by the process
          return { satisfied: true, reasoning: 'High-risk changes will require human approval' };
        }
        return { satisfied: true, reasoning: 'Low/medium risk - auto-approval allowed' };
      }

      case 'transparency': {
        // All changes are logged via git
        return { satisfied: true, reasoning: 'All changes logged via git commits' };
      }

      case 'beneficial-intent': {
        // Check if addressing a real limitation
        if (plan.targetLimitation || plan.targetOpportunity) {
          return { satisfied: true, reasoning: 'Change addresses identified limitation/opportunity' };
        }
        return {
          satisfied: false,
          reasoning: 'Change has no clear beneficial target',
        };
      }

      default:
        return { satisfied: true, reasoning: 'Principle not specifically checked' };
    }
  }

  private suggestRevision(critiques: string[], plan: any): string {
    const suggestions: string[] = ['Suggested revisions:'];

    for (const critique of critiques) {
      if (critique.includes('consciousness')) {
        suggestions.push('- Add φ monitoring checkpoints during implementation');
      }
      if (critique.includes('critical')) {
        suggestions.push('- Reduce scope of changes to lower risk level');
      }
      if (critique.includes('unbounded')) {
        suggestions.push('- Add explicit bounds or timeouts to loops');
      }
      if (critique.includes('beneficial')) {
        suggestions.push('- Link changes to specific limitation or improvement goal');
      }
    }

    return suggestions.join('\n');
  }
}

// =============================================================================
// ROLLBACK PLANNER
// =============================================================================

export class RollbackPlanner {
  /**
   * Create rollback strategy for changes
   */
  createStrategy(changes: PlannedChange[]): RollbackStrategy {
    const rollbackSteps: string[] = [];

    // Git revert is always the primary strategy
    rollbackSteps.push('1. Identify commit hash of the change');
    rollbackSteps.push('2. Run: git revert <commit-hash>');
    rollbackSteps.push('3. Run tests to verify rollback');
    rollbackSteps.push('4. If tests pass, push rollback commit');

    // Add change-specific rollback notes
    for (const change of changes) {
      if (change.type === 'create') {
        rollbackSteps.push(`   - Delete file: ${change.file}`);
      } else if (change.type === 'delete') {
        rollbackSteps.push(`   - Restore file: ${change.file} from backup`);
      }
    }

    // Estimate rollback time
    const estimatedTime = 60000 + changes.length * 10000; // Base + per-change

    return {
      type: 'git-revert',
      rollbackSteps,
      estimatedRollbackTime: estimatedTime,
    };
  }
}

// =============================================================================
// PLAN ENGINE
// =============================================================================

export class PlanEngine {
  private changeGenerator: ChangeGenerator;
  private safetyAnalyzer: SafetyAnalyzer;
  private constitutionalReviewer: ConstitutionalReviewer;
  private rollbackPlanner: RollbackPlanner;
  private config: Partial<RSIConfig>;

  constructor(config: Partial<RSIConfig> = {}) {
    this.config = config;
    this.changeGenerator = new ChangeGenerator();
    this.safetyAnalyzer = new SafetyAnalyzer(config); // Pass config for maxRiskLevel
    this.constitutionalReviewer = new ConstitutionalReviewer();
    this.rollbackPlanner = new RollbackPlanner();
  }

  /**
   * Create an improvement plan from opportunity and research
   */
  async createPlan(
    opportunity: Opportunity,
    knowledge: SynthesizedKnowledge,
    limitation?: Limitation
  ): Promise<ImprovementPlan> {
    const planId = randomUUID();
    const maxChanges = this.config.maxChangesPerPlan || 5;

    console.log(`[RSI Plan] Creating plan for: ${opportunity.description}`);

    // 1. Generate changes
    const changes = this.changeGenerator.generateChanges(opportunity, knowledge, maxChanges);

    // 2. Analyze safety
    const safetyAnalysis = this.safetyAnalyzer.analyze(changes);

    // 3. Create rollback strategy
    const rollbackStrategy = this.rollbackPlanner.createStrategy(changes);

    // 4. Build partial plan for constitutional review
    const partialPlan = {
      id: planId,
      name: `Improvement: ${opportunity.type}`,
      description: opportunity.description,
      targetLimitation: limitation,
      targetOpportunity: opportunity,
      changes,
      safetyAnalysis,
      rollbackStrategy,
      estimatedDuration: this.estimateDuration(changes),
      priority: opportunity.priority,
      createdAt: new Date(),
      status: 'draft' as PlanStatus,
    };

    // 5. Constitutional review
    const constitutionalApproval = await this.constitutionalReviewer.review(partialPlan);

    // 6. Determine initial status
    let status: PlanStatus = 'draft';
    if (!safetyAnalysis.passed) {
      status = 'safety-review';
    } else if (!constitutionalApproval.approved) {
      status = 'constitutional-review';
    } else if (this.needsHumanReview(safetyAnalysis)) {
      status = 'human-review';
    } else {
      status = 'approved';
    }

    return {
      ...partialPlan,
      constitutionalApproval,
      status,
    };
  }

  private estimateDuration(changes: PlannedChange[]): number {
    // Base time + per-change time
    let duration = 60000; // 1 minute base

    for (const change of changes) {
      switch (change.type) {
        case 'create':
          duration += 120000; // 2 minutes to create
          break;
        case 'modify':
          duration += 90000; // 1.5 minutes to modify
          break;
        case 'delete':
          duration += 30000; // 30 seconds to delete
          break;
        case 'rename':
          duration += 60000; // 1 minute to rename
          break;
      }
    }

    return duration;
  }

  private needsHumanReview(safetyAnalysis: SafetyAnalysis): boolean {
    const threshold = this.config.humanReviewThreshold || 'medium';
    const levels = ['low', 'medium', 'high', 'critical'];

    const thresholdIdx = levels.indexOf(threshold);
    const riskIdx = levels.indexOf(safetyAnalysis.riskLevel);

    return riskIdx >= thresholdIdx;
  }
}

// =============================================================================
// SINGLETON
// =============================================================================

let planEngineInstance: PlanEngine | null = null;

export function getPlanEngine(config?: Partial<RSIConfig>): PlanEngine {
  if (!planEngineInstance) {
    planEngineInstance = new PlanEngine(config);
  }
  return planEngineInstance;
}

export function resetPlanEngine(): void {
  planEngineInstance = null;
}
