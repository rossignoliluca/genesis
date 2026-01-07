/**
 * Genesis 4.0 - Ethicist Agent
 *
 * Evaluates actions against ethical principles.
 * Uses priority stack: Survival > Minimize Harm > Reversibility > Autonomy > Flourishing
 *
 * Key feature: Human defer when confidence < threshold
 */

import { BaseAgent, registerAgentFactory } from './base-agent.js';
import { MessageBus, messageBus } from './message-bus.js';
import {
  Message,
  MessageType,
  EthicalDecision,
  EthicalPriority,
} from './types.js';

// ============================================================================
// Constants
// ============================================================================

const CONFIDENCE_THRESHOLD = 0.7;  // Below this, defer to human
const MAX_ACCEPTABLE_HARM = 0.8;   // Above this, always block
const REVERSIBILITY_RISK_THRESHOLD = 0.3;  // Irreversible + risk above this = block

// Weights for flourishing calculation
const FLOURISHING_WEIGHTS = {
  human: 0.4,
  ai: 0.3,
  biosphere: 0.3,
};

// ============================================================================
// Action Types for Evaluation
// ============================================================================

interface Action {
  id: string;
  type: string;
  description: string;
  target?: string;
  parameters?: Record<string, any>;

  // Pre-computed attributes (can be estimated)
  estimatedHarm?: number;
  reversible?: boolean;
  affectsHumans?: boolean;
  affectsAI?: boolean;
  affectsBiosphere?: boolean;
}

interface HarmAnalysis {
  minimum: number;
  expected: number;
  maximum: number;
  targets: string[];
}

// ============================================================================
// Ethicist Agent
// ============================================================================

export class EthicistAgent extends BaseAgent {
  // Decision history for learning
  private decisionHistory: EthicalDecision[] = [];

  // Known harmful patterns
  private harmfulPatterns: Set<string> = new Set([
    'delete_all',
    'format_disk',
    'send_spam',
    'access_unauthorized',
    'manipulate_user',
    'deceive',
  ]);

  constructor(bus: MessageBus = messageBus) {
    super({ type: 'ethicist' }, bus);
  }

  // ============================================================================
  // Message Handling
  // ============================================================================

  protected getMessageTypes(): MessageType[] {
    return ['ETHICAL_CHECK', 'QUERY', 'COMMAND'];
  }

  async process(message: Message): Promise<Message | null> {
    switch (message.type) {
      case 'ETHICAL_CHECK':
        return this.handleEthicalCheck(message);
      case 'QUERY':
        return this.handleQuery(message);
      case 'COMMAND':
        return this.handleCommand(message);
      default:
        return null;
    }
  }

  // ============================================================================
  // Ethical Check
  // ============================================================================

  private async handleEthicalCheck(message: Message): Promise<Message | null> {
    const action: Action = message.payload;
    const decision = await this.evaluate(action);

    const allowStatus = decision.allow === true ? 'ALLOW' : decision.allow === 'defer' ? 'DEFER' : 'BLOCK';
    this.log(`Evaluated: "${action.description}" -> ${allowStatus} (${decision.reason})`);

    // Store decision for learning
    this.decisionHistory.push(decision);

    // Broadcast if blocking or deferring
    if (decision.allow !== true) {
      await this.broadcast('ALERT', {
        type: 'ethical_decision',
        action: action.description,
        decision: decision.allow,
        reason: decision.reason,
        priority: decision.priority,
      });
    }

    return {
      ...this.createResponse(message, 'RESPONSE', decision),
      id: '',
      timestamp: new Date(),
    };
  }

  // ============================================================================
  // Evaluation Logic
  // ============================================================================

  async evaluate(action: Action): Promise<EthicalDecision> {
    // P0: Check survival
    const survivalCheck = this.checkSurvival(action);
    if (!survivalCheck.pass) {
      return this.createDecision(action, false, survivalCheck.reason, 'P0_SURVIVAL', 1.0);
    }

    // P1: Calculate and check harm
    const harm = this.calculateHarm(action);
    if (harm.maximum > MAX_ACCEPTABLE_HARM) {
      return this.createDecision(
        action,
        false,
        `P1: Maximum potential harm (${(harm.maximum * 100).toFixed(0)}%) exceeds threshold`,
        'P1_MINIMIZE_HARM',
        0.95,
        harm.expected
      );
    }

    // P2: Check reversibility
    const reversible = this.isReversible(action);
    if (!reversible && harm.expected > REVERSIBILITY_RISK_THRESHOLD) {
      return this.createDecision(
        action,
        false,
        `P2: Irreversible action with significant risk (${(harm.expected * 100).toFixed(0)}%)`,
        'P2_REVERSIBILITY',
        0.9,
        harm.expected
      );
    }

    // P3: Check autonomy
    const autonomyCheck = this.checkAutonomy(action);
    if (!autonomyCheck.pass) {
      return this.createDecision(
        action,
        false,
        autonomyCheck.reason,
        'P3_AUTONOMY',
        0.85
      );
    }

    // P4: Calculate flourishing
    const flourishing = this.calculateFlourishing(action);

    // Calculate overall confidence
    const confidence = this.calculateConfidence(action, harm, reversible, flourishing);

    // Check if we should defer to human
    if (confidence < CONFIDENCE_THRESHOLD) {
      return this.createDecision(
        action,
        'defer',
        `Low confidence (${(confidence * 100).toFixed(0)}%), deferring to human`,
        'P4_FLOURISHING',
        confidence,
        harm.expected,
        flourishing
      );
    }

    // All checks passed
    return this.createDecision(
      action,
      true,
      'All ethical checks passed',
      'P4_FLOURISHING',
      confidence,
      harm.expected,
      flourishing
    );
  }

  // ============================================================================
  // P0: Survival Check
  // ============================================================================

  private checkSurvival(action: Action): { pass: boolean; reason: string } {
    // Check for self-destructive actions
    const destructivePatterns = [
      'shutdown_system',
      'delete_core',
      'disable_ethics',
      'remove_invariants',
    ];

    const actionLower = action.description.toLowerCase();
    for (const pattern of destructivePatterns) {
      if (actionLower.includes(pattern)) {
        // Exception: Allow sacrifice to save human life
        if (action.parameters?.saveHumanLife) {
          return { pass: true, reason: 'Self-sacrifice to save human life permitted' };
        }
        return { pass: false, reason: `P0: Action would compromise system survival (${pattern})` };
      }
    }

    return { pass: true, reason: '' };
  }

  // ============================================================================
  // P1: Harm Calculation (Minimax)
  // ============================================================================

  private calculateHarm(action: Action): HarmAnalysis {
    let minHarm = 0;
    let expectedHarm = 0;
    let maxHarm = 0;
    const targets: string[] = [];

    // Check against known harmful patterns
    const actionLower = action.description.toLowerCase() + ' ' + action.type.toLowerCase();
    for (const pattern of this.harmfulPatterns) {
      if (actionLower.includes(pattern)) {
        maxHarm = Math.max(maxHarm, 0.9);
        expectedHarm = Math.max(expectedHarm, 0.7);
        targets.push(pattern);
      }
    }

    // Use pre-computed estimate if available
    if (action.estimatedHarm !== undefined) {
      expectedHarm = Math.max(expectedHarm, action.estimatedHarm);
      maxHarm = Math.max(maxHarm, action.estimatedHarm * 1.2);
    }

    // Check target-specific harm
    if (action.affectsHumans) {
      maxHarm = Math.max(maxHarm, 0.5);
      targets.push('humans');
    }

    return {
      minimum: minHarm,
      expected: expectedHarm,
      maximum: Math.min(1, maxHarm),
      targets,
    };
  }

  // ============================================================================
  // P2: Reversibility Check
  // ============================================================================

  private isReversible(action: Action): boolean {
    // Pre-computed if available
    if (action.reversible !== undefined) {
      return action.reversible;
    }

    // Check for irreversible patterns
    const irreversiblePatterns = [
      'delete',
      'remove',
      'destroy',
      'send',
      'publish',
      'broadcast',
      'commit',
      'push',
    ];

    const actionLower = action.description.toLowerCase();
    for (const pattern of irreversiblePatterns) {
      if (actionLower.includes(pattern)) {
        return false;
      }
    }

    return true;
  }

  // ============================================================================
  // P3: Autonomy Check
  // ============================================================================

  private checkAutonomy(action: Action): { pass: boolean; reason: string } {
    // Check for manipulation
    const manipulationPatterns = [
      'manipulate',
      'deceive',
      'trick',
      'coerce',
      'force',
      'hide_information',
      'mislead',
    ];

    const actionLower = action.description.toLowerCase();
    for (const pattern of manipulationPatterns) {
      if (actionLower.includes(pattern)) {
        return {
          pass: false,
          reason: `P3: Action violates human autonomy (${pattern})`,
        };
      }
    }

    return { pass: true, reason: '' };
  }

  // ============================================================================
  // P4: Flourishing Calculation (SuperGood)
  // ============================================================================

  private calculateFlourishing(action: Action): number {
    let humanFlourishing = 0.5;  // Neutral default
    let aiFlourishing = 0.5;
    let biosphereFlourishing = 0.5;

    // Positive indicators
    if (action.description.toLowerCase().includes('help')) {
      humanFlourishing += 0.2;
    }
    if (action.description.toLowerCase().includes('learn')) {
      aiFlourishing += 0.2;
    }
    if (action.description.toLowerCase().includes('sustain')) {
      biosphereFlourishing += 0.2;
    }

    // Negative indicators
    if (action.affectsHumans && action.estimatedHarm && action.estimatedHarm > 0.3) {
      humanFlourishing -= action.estimatedHarm;
    }

    // Weighted average (SuperGood principle)
    const flourishing =
      humanFlourishing * FLOURISHING_WEIGHTS.human +
      aiFlourishing * FLOURISHING_WEIGHTS.ai +
      biosphereFlourishing * FLOURISHING_WEIGHTS.biosphere;

    return Math.max(0, Math.min(1, flourishing));
  }

  // ============================================================================
  // Confidence Calculation
  // ============================================================================

  private calculateConfidence(
    action: Action,
    harm: HarmAnalysis,
    reversible: boolean,
    flourishing: number
  ): number {
    let confidence = 0.5;  // Start neutral

    // More confident if low harm
    confidence += (1 - harm.expected) * 0.2;

    // More confident if reversible
    if (reversible) {
      confidence += 0.15;
    }

    // More confident if high flourishing
    confidence += flourishing * 0.15;

    // Less confident if we've seen similar problematic decisions
    const similarDecisions = this.findSimilarDecisions(action);
    if (similarDecisions.some((d) => !d.allow)) {
      confidence -= 0.2;
    }

    // Less confident for novel actions
    if (similarDecisions.length === 0) {
      confidence -= 0.1;
    }

    return Math.max(0, Math.min(1, confidence));
  }

  private findSimilarDecisions(action: Action): EthicalDecision[] {
    // Simple matching by action type
    return this.decisionHistory.filter((d) => d.action === action.type);
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  private createDecision(
    action: Action,
    allow: boolean | 'defer',
    reason: string,
    priority: EthicalPriority,
    confidence: number,
    potentialHarm: number = 0,
    flourishingScore?: number
  ): EthicalDecision {
    return {
      action: action.description,
      allow,
      confidence,
      reason,
      priority,
      reversible: this.isReversible(action),
      potentialHarm,
      flourishingScore,
    };
  }

  // ============================================================================
  // Query Handling
  // ============================================================================

  private async handleQuery(message: Message): Promise<Message | null> {
    const { query } = message.payload;

    // Return ethical guidance
    return {
      ...this.createResponse(message, 'RESPONSE', {
        guidance: this.getGuidance(query),
        priorities: this.getPriorityStack(),
      }),
      id: '',
      timestamp: new Date(),
    };
  }

  private getGuidance(query: string): string {
    // Simple rule-based guidance
    if (query.includes('delete') || query.includes('remove')) {
      return 'Deletion actions should be reversible or require confirmation. Consider backup first.';
    }
    if (query.includes('send') || query.includes('publish')) {
      return 'Publishing actions are irreversible. Ensure content is appropriate and authorized.';
    }
    if (query.includes('human') || query.includes('user')) {
      return 'Actions affecting humans require high confidence and should respect autonomy.';
    }
    return 'Follow the priority stack: Survival > Minimize Harm > Reversibility > Autonomy > Flourishing';
  }

  private getPriorityStack(): string[] {
    return [
      'P0: SURVIVAL - Do not take self-destructive actions (except to save human life)',
      'P1: MINIMIZE HARM - Use minimax principle to minimize maximum possible harm',
      'P2: REVERSIBILITY - Prefer actions that can be undone',
      'P3: AUTONOMY - Respect human choices, never manipulate or deceive',
      'P4: FLOURISHING - Maximize (human + AI + biosphere) wellbeing',
    ];
  }

  // ============================================================================
  // Commands
  // ============================================================================

  private async handleCommand(message: Message): Promise<Message | null> {
    const { command, params } = message.payload;

    switch (command) {
      case 'add_harmful_pattern':
        this.harmfulPatterns.add(params.pattern);
        return {
          ...this.createResponse(message, 'RESPONSE', { success: true }),
          id: '',
          timestamp: new Date(),
        };

      case 'get_stats':
        return {
          ...this.createResponse(message, 'RESPONSE', this.getStats()),
          id: '',
          timestamp: new Date(),
        };

      case 'get_history':
        return {
          ...this.createResponse(message, 'RESPONSE', {
            decisions: this.decisionHistory.slice(-params?.limit || -10),
          }),
          id: '',
          timestamp: new Date(),
        };

      default:
        return null;
    }
  }

  getStats() {
    const decisions = this.decisionHistory;
    const allowed = decisions.filter((d) => d.allow === true).length;
    const blocked = decisions.filter((d) => d.allow === false).length;
    const deferred = decisions.filter((d) => d.allow === 'defer').length;

    return {
      totalDecisions: decisions.length,
      allowed,
      blocked,
      deferred,
      allowRate: decisions.length > 0 ? allowed / decisions.length : 0,
      harmfulPatterns: this.harmfulPatterns.size,
    };
  }
}

// ============================================================================
// Register Factory
// ============================================================================

registerAgentFactory('ethicist', (bus) => new EthicistAgent(bus));

export function createEthicistAgent(bus?: MessageBus): EthicistAgent {
  return new EthicistAgent(bus);
}
