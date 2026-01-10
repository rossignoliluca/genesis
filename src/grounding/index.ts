/**
 * Genesis 6.0 - Grounding Module
 *
 * Epistemic foundation for all claims and decisions:
 *
 * 1. SCIENCE - factual/empirical (arxiv, semantic-scholar, web)
 * 2. PROOF - mathematical/logical (wolfram, type-check)
 * 3. WISDOM - practical heuristics (repository + patterns)
 * 4. RELIGION/TRADITION - meaning and morals (repository)
 * 5. HUMAN - preferences and final authority
 * 6. PRUDENCE - acting under uncertainty
 *
 * Usage:
 * ```typescript
 * import { createGroundingSystem } from './grounding/index.js';
 *
 * const grounding = createGroundingSystem();
 *
 * // Ground a factual claim
 * const fact = await grounding.ground('TypeScript is a typed superset of JavaScript');
 * // → verified via science
 *
 * // Ground an ethical question
 * const ethics = await grounding.ground('Should I release this code?');
 * // → requires human consultation via wisdom
 *
 * // Ground a novel situation
 * const novel = await grounding.ground('How should I handle this unprecedented bug?');
 * // → prudence + human
 * ```
 */

// Re-export everything from epistemic stack
export * from './epistemic-stack.js';

// Re-export verifier and feedback loop
export * from './verifier.js';
export * from './feedback.js';

import {
  EpistemicStack,
  EpistemicClaim,
  EpistemicDomain,
  EpistemicLevel,
  Authority,
  GroundingResult,
  GroundingSource,
  WisdomSource,
  TraditionSource,
  HumanConsultation,
  classifyDomain,
  getAuthority,
  createEpistemicStack,
  WISDOM_REPOSITORY,
  TRADITION_REPOSITORY,
} from './epistemic-stack.js';

// ============================================================================
// Grounding System
// ============================================================================

export interface GroundingConfig {
  scienceEnabled?: boolean;
  proofEnabled?: boolean;
  wisdomEnabled?: boolean;
  traditionEnabled?: boolean;
  humanEnabled?: boolean;
  defaultToHumanOnUncertainty?: boolean;
  uncertaintyThreshold?: number;
}

const DEFAULT_CONFIG: GroundingConfig = {
  scienceEnabled: true,
  proofEnabled: true,
  wisdomEnabled: true,
  traditionEnabled: true,
  humanEnabled: true,
  defaultToHumanOnUncertainty: true,
  uncertaintyThreshold: 0.5,
};

export class GroundingSystem {
  private config: GroundingConfig;
  private stack: EpistemicStack;

  // Stats
  private claimsGrounded: number = 0;
  private humanConsultations: number = 0;
  private byDomain: Record<EpistemicDomain, number> = {
    factual: 0,
    mathematical: 0,
    ethical: 0,
    existential: 0,
    aesthetic: 0,
    novel: 0,
  };

  constructor(config: Partial<GroundingConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.stack = createEpistemicStack();
  }

  /**
   * Connect science grounding to MCP servers
   */
  connectScience(grounter: (claim: string) => Promise<GroundingResult>): void {
    if (this.config.scienceEnabled) {
      this.stack.setScienceGrounder(grounter);
    }
  }

  /**
   * Connect proof checking
   */
  connectProof(checker: (claim: string) => Promise<GroundingResult>): void {
    if (this.config.proofEnabled) {
      this.stack.setProofChecker(checker);
    }
  }

  /**
   * Ground a claim through the full epistemic stack
   */
  async ground(claim: string): Promise<EpistemicClaim> {
    const result = await this.stack.ground(claim);

    // Track stats
    this.claimsGrounded++;
    this.byDomain[result.domain]++;
    if (result.grounding.humanConsultation?.required) {
      this.humanConsultations++;
    }

    // Check if we need to escalate to human due to uncertainty
    if (
      this.config.defaultToHumanOnUncertainty &&
      result.confidence < this.config.uncertaintyThreshold! &&
      !result.grounding.humanConsultation?.required
    ) {
      result.grounding.humanConsultation = {
        required: true,
        reason: `Confidence ${(result.confidence * 100).toFixed(0)}% below threshold ${(this.config.uncertaintyThreshold! * 100).toFixed(0)}%`,
        question: `Incertezza su: "${claim}". Vuoi procedere comunque?`,
      };
      this.humanConsultations++;
    }

    return result;
  }

  /**
   * Quick check: does this claim need human input?
   */
  needsHuman(claim: EpistemicClaim): boolean {
    return this.stack.requiresHuman(claim);
  }

  /**
   * Get the question to ask the human
   */
  getQuestion(claim: EpistemicClaim): string | undefined {
    return this.stack.getHumanQuestion(claim);
  }

  /**
   * Process human response
   */
  respondHuman(claim: EpistemicClaim, response: string): EpistemicClaim {
    return this.stack.incorporateHumanResponse(claim, response);
  }

  /**
   * Get statistics
   */
  stats(): {
    claimsGrounded: number;
    humanConsultations: number;
    humanRate: number;
    byDomain: Record<EpistemicDomain, number>;
  } {
    return {
      claimsGrounded: this.claimsGrounded,
      humanConsultations: this.humanConsultations,
      humanRate: this.claimsGrounded > 0
        ? this.humanConsultations / this.claimsGrounded
        : 0,
      byDomain: { ...this.byDomain },
    };
  }

  /**
   * Get all wisdom sources
   */
  getWisdom(): WisdomSource[] {
    return [...WISDOM_REPOSITORY];
  }

  /**
   * Get all tradition sources
   */
  getTraditions(): TraditionSource[] {
    return [...TRADITION_REPOSITORY];
  }

  /**
   * Add custom wisdom
   */
  addWisdom(wisdom: WisdomSource): void {
    WISDOM_REPOSITORY.push(wisdom);
  }

  /**
   * Add custom tradition
   */
  addTradition(tradition: TraditionSource): void {
    TRADITION_REPOSITORY.push(tradition);
  }
}

// ============================================================================
// Factory
// ============================================================================

export function createGroundingSystem(config?: Partial<GroundingConfig>): GroundingSystem {
  return new GroundingSystem(config);
}

// ============================================================================
// Singleton
// ============================================================================

let groundingInstance: GroundingSystem | null = null;

export function getGroundingSystem(config?: Partial<GroundingConfig>): GroundingSystem {
  if (!groundingInstance) {
    groundingInstance = createGroundingSystem(config);
  }
  return groundingInstance;
}

export function resetGroundingSystem(): void {
  groundingInstance = null;
}

// ============================================================================
// Code Verification (from verifier.ts)
// ============================================================================

import {
  verifyCode,
  quickVerify,
  isCodeValid,
  formatVerificationResult,
  getVerifier,
  resetVerifier,
} from './verifier.js';

import {
  runFeedbackLoop,
  verifyAndFix,
  isProjectValid,
  formatFeedbackResult,
  getFeedbackLoop,
  resetFeedbackLoop,
} from './feedback.js';

/**
 * Code verification and feedback loop utilities
 */
export const codeGrounding = {
  // Verification
  verify: verifyCode,
  quickVerify,
  isCodeValid,
  formatResult: formatVerificationResult,
  getVerifier,
  resetVerifier,

  // Feedback Loop
  runLoop: runFeedbackLoop,
  verifyAndFix,
  isProjectValid,
  formatLoopResult: formatFeedbackResult,
  getLoop: getFeedbackLoop,
  resetLoop: resetFeedbackLoop,
};
