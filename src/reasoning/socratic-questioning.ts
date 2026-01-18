/**
 * SOCRATIC SELF-QUESTIONING
 *
 * Implements recursive self-interrogation for deeper understanding.
 * The system questions its own beliefs, assumptions, and conclusions.
 *
 * Based on:
 * - Socratic Method (Plato's Dialogues)
 * - Metacognition research
 * - Self-Explanation in Learning
 * - Chain-of-Thought prompting
 *
 * Question types:
 * 1. Clarification: "What do I mean by X?"
 * 2. Probing assumptions: "What am I assuming here?"
 * 3. Probing reasons: "Why do I believe this?"
 * 4. Questioning viewpoints: "What's the alternative view?"
 * 5. Probing implications: "What follows from this?"
 * 6. Questioning the question: "Why is this question important?"
 */

// ============================================================================
// TYPES
// ============================================================================

export interface SocraticConfig {
  maxDepth: number;                  // Maximum questioning depth
  questionTypes: QuestionType[];
  confidenceThreshold: number;       // Stop when confidence is high enough
  timeLimit: number;                 // Max time for questioning (ms)
  persistQuestions: boolean;         // Save questions for reflection
}

export type QuestionType =
  | 'clarification'
  | 'assumptions'
  | 'reasons'
  | 'viewpoints'
  | 'implications'
  | 'meta';

export interface SocraticQuestion {
  type: QuestionType;
  question: string;
  targetBelief: string;
  depth: number;
  timestamp: number;
}

export interface SocraticAnswer {
  answer: string;
  confidence: number;
  supportingEvidence: string[];
  uncertainties: string[];
  followUpQuestions: string[];
}

export interface SocraticDialogue {
  id: string;
  topic: string;
  exchanges: SocraticExchange[];
  startTime: number;
  endTime?: number;
  finalConclusion?: string;
  confidenceProgression: number[];
  insightsGained: string[];
}

export interface SocraticExchange {
  question: SocraticQuestion;
  answer: SocraticAnswer;
  refinedBelief?: string;
}

export interface BeliefState {
  belief: string;
  confidence: number;
  assumptions: string[];
  evidence: string[];
  counterEvidence: string[];
  alternatives: string[];
}

// ============================================================================
// SOCRATIC QUESTIONER
// ============================================================================

export class SocraticQuestioner {
  private config: SocraticConfig;
  private dialogues: Map<string, SocraticDialogue> = new Map();
  private questionTemplates: Map<QuestionType, string[]>;

  constructor(config: Partial<SocraticConfig> = {}) {
    this.config = {
      maxDepth: 5,
      questionTypes: ['clarification', 'assumptions', 'reasons', 'viewpoints', 'implications', 'meta'],
      confidenceThreshold: 0.85,
      timeLimit: 30000,
      persistQuestions: true,
      ...config
    };

    this.questionTemplates = this.initQuestionTemplates();
  }

  private initQuestionTemplates(): Map<QuestionType, string[]> {
    const templates = new Map<QuestionType, string[]>();

    templates.set('clarification', [
      'What exactly do I mean by "{concept}"?',
      'Can I define "{concept}" more precisely?',
      'What examples illustrate "{concept}"?',
      'How would I explain "{concept}" to someone unfamiliar?',
      'What are the boundaries of "{concept}"?'
    ]);

    templates.set('assumptions', [
      'What assumptions am I making about "{belief}"?',
      'What if my assumption about "{aspect}" is wrong?',
      'What do I take for granted in this reasoning?',
      'What background beliefs support this conclusion?',
      'Which assumptions can I verify vs which must I accept?'
    ]);

    templates.set('reasons', [
      'Why do I believe "{belief}"?',
      'What evidence supports "{claim}"?',
      'How strong is the evidence for "{belief}"?',
      'Could the evidence be interpreted differently?',
      'What would change my mind about "{belief}"?'
    ]);

    templates.set('viewpoints', [
      'What alternative explanation exists for "{observation}"?',
      'Who might disagree with "{belief}" and why?',
      'What perspective am I not considering?',
      'How would a skeptic view "{claim}"?',
      'What would the opposite conclusion look like?'
    ]);

    templates.set('implications', [
      'What follows from believing "{belief}"?',
      'What are the consequences of "{conclusion}"?',
      'If "{belief}" is true, what else must be true?',
      'What predictions does "{belief}" make?',
      'How would "{conclusion}" affect my other beliefs?'
    ]);

    templates.set('meta', [
      'Why is understanding "{topic}" important?',
      'What question am I really trying to answer?',
      'Is this the right question to ask?',
      'What kind of answer would satisfy me?',
      'Am I asking about the right thing?'
    ]);

    return templates;
  }

  // --------------------------------------------------------------------------
  // MAIN API
  // --------------------------------------------------------------------------

  /**
   * Start a Socratic dialogue on a topic/belief
   */
  startDialogue(topic: string, initialBelief: string): SocraticDialogue {
    const dialogue: SocraticDialogue = {
      id: `socratic_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      topic,
      exchanges: [],
      startTime: Date.now(),
      confidenceProgression: [],
      insightsGained: []
    };

    this.dialogues.set(dialogue.id, dialogue);

    // Start with initial belief state
    const beliefState: BeliefState = {
      belief: initialBelief,
      confidence: 0.5,  // Start uncertain
      assumptions: [],
      evidence: [],
      counterEvidence: [],
      alternatives: []
    };

    // Run recursive questioning
    this.recursiveQuestion(dialogue, beliefState, 0);

    return dialogue;
  }

  /**
   * Continue an existing dialogue
   */
  continueDialogue(dialogueId: string, userResponse?: string): SocraticDialogue | null {
    const dialogue = this.dialogues.get(dialogueId);
    if (!dialogue) return null;

    if (userResponse && dialogue.exchanges.length > 0) {
      // Incorporate user response into last exchange
      const lastExchange = dialogue.exchanges[dialogue.exchanges.length - 1];
      lastExchange.answer.answer = userResponse;

      // Generate follow-up based on response
      const followUp = this.generateFollowUp(dialogue, userResponse);
      if (followUp) {
        const beliefState = this.extractBeliefState(dialogue);
        this.recursiveQuestion(dialogue, beliefState, dialogue.exchanges.length);
      }
    }

    return dialogue;
  }

  // --------------------------------------------------------------------------
  // RECURSIVE QUESTIONING
  // --------------------------------------------------------------------------

  private recursiveQuestion(
    dialogue: SocraticDialogue,
    beliefState: BeliefState,
    depth: number
  ): void {
    // Check stopping conditions
    if (depth >= this.config.maxDepth) {
      dialogue.finalConclusion = this.synthesizeConclusion(dialogue, beliefState);
      dialogue.endTime = Date.now();
      return;
    }

    if (beliefState.confidence >= this.config.confidenceThreshold) {
      dialogue.finalConclusion = beliefState.belief;
      dialogue.endTime = Date.now();
      return;
    }

    if (Date.now() - dialogue.startTime > this.config.timeLimit) {
      dialogue.finalConclusion = `Time limit reached. Current belief: ${beliefState.belief}`;
      dialogue.endTime = Date.now();
      return;
    }

    // Select question type based on current state
    const questionType = this.selectQuestionType(beliefState, depth);
    const question = this.generateQuestion(questionType, beliefState);

    // Generate answer (self-questioning)
    const answer = this.generateAnswer(question, beliefState);

    // Create exchange
    const exchange: SocraticExchange = {
      question,
      answer,
      refinedBelief: this.refineBelief(beliefState, answer)
    };

    dialogue.exchanges.push(exchange);
    dialogue.confidenceProgression.push(answer.confidence);

    // Extract insights
    const insights = this.extractInsights(exchange);
    dialogue.insightsGained.push(...insights);

    // Update belief state
    const updatedBelief = this.updateBeliefState(beliefState, exchange);

    // Recurse with updated state
    this.recursiveQuestion(dialogue, updatedBelief, depth + 1);
  }

  private selectQuestionType(beliefState: BeliefState, depth: number): QuestionType {
    // Strategy: cycle through question types, prioritizing based on state

    // If confidence is low, focus on clarification and evidence
    if (beliefState.confidence < 0.4) {
      return depth % 2 === 0 ? 'clarification' : 'reasons';
    }

    // If assumptions are unclear, probe them
    if (beliefState.assumptions.length === 0) {
      return 'assumptions';
    }

    // If no alternatives considered, explore viewpoints
    if (beliefState.alternatives.length === 0) {
      return 'viewpoints';
    }

    // Otherwise, explore implications or go meta
    const types = this.config.questionTypes;
    return types[depth % types.length];
  }

  private generateQuestion(type: QuestionType, beliefState: BeliefState): SocraticQuestion {
    const templates = this.questionTemplates.get(type) || ['What should I ask about "{belief}"?'];
    const template = templates[Math.floor(Math.random() * templates.length)];

    // Fill in template
    let questionText = template
      .replace('{belief}', beliefState.belief)
      .replace('{concept}', this.extractMainConcept(beliefState.belief))
      .replace('{claim}', beliefState.belief)
      .replace('{topic}', beliefState.belief)
      .replace('{observation}', beliefState.evidence[0] || beliefState.belief)
      .replace('{conclusion}', beliefState.belief)
      .replace('{aspect}', beliefState.assumptions[0] || 'this');

    return {
      type,
      question: questionText,
      targetBelief: beliefState.belief,
      depth: 0,  // Will be updated
      timestamp: Date.now()
    };
  }

  private extractMainConcept(belief: string): string {
    // Extract key noun phrase (simplified)
    const words = belief.split(' ');
    const nouns = words.filter(w => w.length > 4 && !this.isCommonWord(w));
    return nouns[0] || words[Math.floor(words.length / 2)];
  }

  private isCommonWord(word: string): boolean {
    const common = new Set([
      'the', 'and', 'that', 'this', 'with', 'from', 'have', 'are', 'was', 'were',
      'been', 'being', 'will', 'would', 'could', 'should', 'because', 'about'
    ]);
    return common.has(word.toLowerCase());
  }

  // --------------------------------------------------------------------------
  // ANSWER GENERATION
  // --------------------------------------------------------------------------

  private generateAnswer(question: SocraticQuestion, beliefState: BeliefState): SocraticAnswer {
    // Generate answer based on question type
    const answer = this.answerByType(question.type, question.question, beliefState);
    const confidence = this.assessAnswerConfidence(answer, beliefState);
    const followUps = this.generateFollowUpQuestions(question, answer);

    return {
      answer,
      confidence,
      supportingEvidence: beliefState.evidence.slice(0, 3),
      uncertainties: this.identifyUncertainties(answer),
      followUpQuestions: followUps
    };
  }

  private answerByType(type: QuestionType, question: string, beliefState: BeliefState): string {
    switch (type) {
      case 'clarification':
        return this.answerClarification(beliefState);
      case 'assumptions':
        return this.answerAssumptions(beliefState);
      case 'reasons':
        return this.answerReasons(beliefState);
      case 'viewpoints':
        return this.answerViewpoints(beliefState);
      case 'implications':
        return this.answerImplications(beliefState);
      case 'meta':
        return this.answerMeta(question, beliefState);
      default:
        return `Considering the question: ${question}`;
    }
  }

  private answerClarification(beliefState: BeliefState): string {
    const concept = this.extractMainConcept(beliefState.belief);
    return `"${concept}" in this context means the core assertion that ${beliefState.belief}. ` +
           `This can be understood as a claim about ${this.identifyClaimType(beliefState.belief)}.`;
  }

  private answerAssumptions(beliefState: BeliefState): string {
    const assumptions = [
      `I assume ${this.generateAssumption(beliefState.belief, 'causal')}`,
      `I take for granted that ${this.generateAssumption(beliefState.belief, 'scope')}`,
      `Implicitly, I believe ${this.generateAssumption(beliefState.belief, 'validity')}`
    ];

    beliefState.assumptions.push(...assumptions.map(a => a.substring(9)));

    return assumptions.join('. ') + '. These assumptions may need examination.';
  }

  private answerReasons(beliefState: BeliefState): string {
    if (beliefState.evidence.length === 0) {
      return `I believe "${beliefState.belief}" based on initial assessment, but I haven't explicitly gathered strong evidence. This is a weakness in my reasoning.`;
    }

    return `My belief is supported by: ${beliefState.evidence.slice(0, 3).join('; ')}. ` +
           `However, the strength of this evidence is ${beliefState.confidence > 0.6 ? 'moderate' : 'limited'}.`;
  }

  private answerViewpoints(beliefState: BeliefState): string {
    const alternative = this.generateAlternativeView(beliefState.belief);
    beliefState.alternatives.push(alternative);

    return `An alternative view would be: ${alternative}. ` +
           `This perspective challenges my assumption that ${beliefState.assumptions[0] || 'my initial framing is correct'}.`;
  }

  private answerImplications(beliefState: BeliefState): string {
    const implications = this.deriveImplications(beliefState.belief);
    return `If "${beliefState.belief}" is true, then: ${implications.join('; ')}. ` +
           `These consequences should be consistent with my other beliefs.`;
  }

  private answerMeta(question: string, beliefState: BeliefState): string {
    return `This question matters because understanding "${beliefState.belief}" affects ` +
           `how I approach related problems. The deeper question may be about ` +
           `${this.identifyDeeperQuestion(beliefState.belief)}.`;
  }

  // --------------------------------------------------------------------------
  // BELIEF UPDATE
  // --------------------------------------------------------------------------

  private updateBeliefState(beliefState: BeliefState, exchange: SocraticExchange): BeliefState {
    const updated = { ...beliefState };

    // Update confidence based on answer
    const confidenceDelta = (exchange.answer.confidence - 0.5) * 0.2;
    updated.confidence = Math.max(0, Math.min(1, updated.confidence + confidenceDelta));

    // Add discovered uncertainties to counter-evidence
    updated.counterEvidence.push(...exchange.answer.uncertainties);

    // Refine belief if refined version exists
    if (exchange.refinedBelief) {
      updated.belief = exchange.refinedBelief;
    }

    return updated;
  }

  private refineBelief(beliefState: BeliefState, answer: SocraticAnswer): string {
    // Only refine if confidence improved
    if (answer.confidence <= beliefState.confidence) {
      return beliefState.belief;
    }

    // Add nuance based on discovered uncertainties
    if (answer.uncertainties.length > 0) {
      return `${beliefState.belief}, with the caveat that ${answer.uncertainties[0]}`;
    }

    return beliefState.belief;
  }

  // --------------------------------------------------------------------------
  // HELPERS
  // --------------------------------------------------------------------------

  private identifyClaimType(belief: string): string {
    if (belief.includes('because') || belief.includes('causes')) return 'causation';
    if (belief.includes('is') || belief.includes('are')) return 'classification or identity';
    if (belief.includes('should') || belief.includes('must')) return 'normative prescription';
    if (belief.includes('will') || belief.includes('would')) return 'prediction';
    return 'factual assertion';
  }

  private generateAssumption(belief: string, type: 'causal' | 'scope' | 'validity'): string {
    switch (type) {
      case 'causal':
        return `the relationships I'm inferring are causal, not merely correlational`;
      case 'scope':
        return `this applies generally, not just to specific cases I've considered`;
      case 'validity':
        return `my sources and reasoning process are reliable`;
    }
  }

  private generateAlternativeView(belief: string): string {
    // Simple negation or reframing
    if (belief.includes('is')) {
      return belief.replace(/is/g, 'might not be');
    }
    if (belief.includes('will')) {
      return belief.replace(/will/g, 'might not');
    }
    return `The opposite: it's possible that NOT (${belief})`;
  }

  private deriveImplications(belief: string): string[] {
    return [
      `related decisions should account for this`,
      `future predictions should be consistent with this`,
      `contradictory observations would challenge this belief`
    ];
  }

  private identifyDeeperQuestion(belief: string): string {
    return `the fundamental nature of what makes "${this.extractMainConcept(belief)}" important`;
  }

  private assessAnswerConfidence(answer: string, beliefState: BeliefState): number {
    // Higher confidence if answer addresses uncertainties
    let confidence = beliefState.confidence;

    // Increase if evidence mentioned
    if (answer.includes('evidence') || answer.includes('supported')) {
      confidence += 0.1;
    }

    // Decrease if many uncertainties
    if (answer.includes('however') || answer.includes('but')) {
      confidence -= 0.05;
    }

    return Math.max(0.1, Math.min(0.95, confidence));
  }

  private identifyUncertainties(answer: string): string[] {
    const uncertainties: string[] = [];

    if (answer.includes('assume') || answer.includes('assumption')) {
      uncertainties.push('This relies on unverified assumptions');
    }
    if (answer.includes('limited') || answer.includes('weakness')) {
      uncertainties.push('Evidence may be insufficient');
    }
    if (answer.includes('alternative') || answer.includes('however')) {
      uncertainties.push('Alternative explanations exist');
    }

    return uncertainties;
  }

  private generateFollowUpQuestions(question: SocraticQuestion, answer: string): string[] {
    const followUps: string[] = [];

    if (answer.includes('assumption')) {
      followUps.push('Which assumption is most critical to verify?');
    }
    if (answer.includes('evidence')) {
      followUps.push('What additional evidence would strengthen this conclusion?');
    }
    if (answer.includes('alternative')) {
      followUps.push('How can I evaluate between the alternative views?');
    }

    return followUps.slice(0, 2);
  }

  private extractInsights(exchange: SocraticExchange): string[] {
    const insights: string[] = [];

    if (exchange.answer.uncertainties.length > 0) {
      insights.push(`Discovered uncertainty: ${exchange.answer.uncertainties[0]}`);
    }
    if (exchange.refinedBelief && exchange.refinedBelief !== exchange.question.targetBelief) {
      insights.push(`Refined understanding: ${exchange.refinedBelief}`);
    }

    return insights;
  }

  private extractBeliefState(dialogue: SocraticDialogue): BeliefState {
    const lastExchange = dialogue.exchanges[dialogue.exchanges.length - 1];
    const lastConfidence = dialogue.confidenceProgression[dialogue.confidenceProgression.length - 1] || 0.5;

    return {
      belief: lastExchange?.refinedBelief || dialogue.topic,
      confidence: lastConfidence,
      assumptions: dialogue.exchanges.flatMap(e =>
        e.answer.supportingEvidence.filter(ev => ev.includes('assume'))
      ),
      evidence: dialogue.exchanges.flatMap(e => e.answer.supportingEvidence),
      counterEvidence: dialogue.exchanges.flatMap(e => e.answer.uncertainties),
      alternatives: []
    };
  }

  private generateFollowUp(dialogue: SocraticDialogue, response: string): SocraticQuestion | null {
    // Generate follow-up based on user response
    const beliefState = this.extractBeliefState(dialogue);

    if (response.toLowerCase().includes('why')) {
      return this.generateQuestion('reasons', beliefState);
    }
    if (response.toLowerCase().includes('what if')) {
      return this.generateQuestion('implications', beliefState);
    }

    return this.generateQuestion(
      this.selectQuestionType(beliefState, dialogue.exchanges.length),
      beliefState
    );
  }

  private synthesizeConclusion(dialogue: SocraticDialogue, beliefState: BeliefState): string {
    const insights = dialogue.insightsGained.slice(0, 3).join('; ');
    const confidence = beliefState.confidence.toFixed(2);

    return `After ${dialogue.exchanges.length} rounds of questioning, ` +
           `the refined belief is: "${beliefState.belief}" ` +
           `(confidence: ${confidence}). ` +
           `Key insights: ${insights || 'deeper examination of assumptions needed'}.`;
  }

  // --------------------------------------------------------------------------
  // PUBLIC API
  // --------------------------------------------------------------------------

  getDialogue(id: string): SocraticDialogue | undefined {
    return this.dialogues.get(id);
  }

  getAllDialogues(): SocraticDialogue[] {
    return Array.from(this.dialogues.values());
  }

  getConfig(): SocraticConfig {
    return { ...this.config };
  }
}

// ============================================================================
// EXPORT
// ============================================================================

export function createSocraticQuestioner(config?: Partial<SocraticConfig>): SocraticQuestioner {
  return new SocraticQuestioner(config);
}
