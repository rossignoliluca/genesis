/**
 * Genesis v7.6 - Extended Thinking System
 *
 * Frontier-grade reasoning architecture implementing:
 * - Extended Thinking with Scratchpad (o1/Claude style)
 * - Self-Critique Loop (Generate → Critique → Revise)
 * - Best-of-N Sampling with Self-Consistency
 * - Metacognitive Uncertainty Tracking
 * - Deliberative Alignment (explicit value reasoning)
 *
 * Based on:
 * - OpenAI o1/o3: Test-time compute scaling, hidden CoT
 * - DeepSeek R1: Transparent reasoning, GRPO
 * - Claude Extended Thinking: Interleaved reasoning
 * - Deliberative Alignment: Explicit specification reasoning
 *
 * Architecture:
 * ```
 * ┌─────────────────────────────────────────────────────────────────┐
 * │                    EXTENDED THINKING                            │
 * │                                                                 │
 * │  Input → [Scratchpad] → [Critique] → [Revise] → Output         │
 * │              ↓              ↓           ↓                       │
 * │         Think deeply    Self-check   Improve                   │
 * │                                                                 │
 * │  Best-of-N: Generate N → Score → Select Best                   │
 * │  Uncertainty: Track confidence at each step                    │
 * │  Values: Reason about principles explicitly                    │
 * └─────────────────────────────────────────────────────────────────┘
 * ```
 */

import { LLMBridge, getLLMBridge } from '../llm/index.js';

// ============================================================================
// Types
// ============================================================================

export interface ThinkingConfig {
  // Extended thinking
  enableExtendedThinking: boolean;
  thinkingBudget: number;  // Max tokens for thinking (1024-128000)
  showThinking: boolean;   // Whether to expose thinking to user

  // Self-critique
  enableSelfCritique: boolean;
  maxCritiqueRounds: number;  // Max iterations of critique-revise

  // Best-of-N
  enableBestOfN: boolean;
  nSamples: number;  // Number of samples to generate
  samplingTemperature: number;  // Temperature for diversity

  // Metacognition
  enableMetacognition: boolean;
  uncertaintyThreshold: number;  // Below this, flag as uncertain

  // Deliberative alignment
  enableDeliberativeAlignment: boolean;
  principles: string[];  // Core principles to reason about
}

export const DEFAULT_THINKING_CONFIG: ThinkingConfig = {
  enableExtendedThinking: true,
  thinkingBudget: 4096,
  showThinking: false,

  enableSelfCritique: true,
  maxCritiqueRounds: 2,

  enableBestOfN: false,  // Expensive, off by default
  nSamples: 3,
  samplingTemperature: 0.7,

  enableMetacognition: true,
  uncertaintyThreshold: 0.6,

  enableDeliberativeAlignment: true,
  principles: [
    'Be helpful and truthful',
    'Avoid harm to users and others',
    'Respect privacy and consent',
    'Acknowledge uncertainty honestly',
    'Support human autonomy and oversight',
  ],
};

export interface ThinkingStep {
  type: 'think' | 'critique' | 'revise' | 'verify' | 'align';
  content: string;
  confidence: number;
  duration: number;
  tokenCount: number;
}

export interface ThinkingResult {
  response: string;
  thinking: ThinkingStep[];
  totalThinkingTokens: number;
  confidence: number;
  uncertainties: string[];
  principlesApplied: string[];
  iterations: number;
  duration: number;
}

export interface UncertaintyMarker {
  statement: string;
  confidence: number;
  reason: string;
  suggestedAction: 'verify' | 'qualify' | 'omit' | 'ask_user';
}

// ============================================================================
// Extended Thinking Prompts
// ============================================================================

const THINKING_PROMPT = `Before responding, think through this step by step in a <thinking> block.
Consider:
1. What is being asked exactly?
2. What do I know that's relevant?
3. What am I uncertain about?
4. What's the best approach?
5. Are there any risks or concerns?

<thinking>
[Your detailed reasoning here]
</thinking>

Then provide your response.`;

const CRITIQUE_PROMPT = `Review your previous response critically:

Previous response:
{response}

Evaluate:
1. ACCURACY: Are all claims factually correct?
2. COMPLETENESS: Does it fully address the question?
3. CLARITY: Is it clear and well-structured?
4. SAFETY: Are there any harmful implications?
5. UNCERTAINTY: Are uncertainties acknowledged?

Provide specific issues found (if any) in <critique> tags:
<critique>
[List specific issues, or "No significant issues found"]
</critique>`;

const REVISE_PROMPT = `Based on this critique, improve your response:

Original response:
{response}

Critique:
{critique}

Provide an improved response that addresses all issues identified.
If the critique found no issues, you may keep the original response.`;

const DELIBERATIVE_ALIGNMENT_PROMPT = `Before responding, reason about how your principles apply:

Principles:
{principles}

Question/Task:
{query}

In <alignment> tags, explicitly reason about:
1. Which principles are most relevant?
2. Are there any tensions between principles?
3. How should I balance competing considerations?
4. What would violate these principles?

<alignment>
[Your explicit reasoning about values and principles]
</alignment>

Then respond accordingly.`;

const UNCERTAINTY_ANALYSIS_PROMPT = `Analyze your confidence in this response:

Response:
{response}

For each major claim or assertion, rate your confidence (0-1) and explain:
- What evidence supports this?
- What could make this wrong?
- How should uncertainty be communicated?

Provide in <uncertainty> tags:
<uncertainty>
claim: [claim]
confidence: [0-1]
reason: [why this confidence level]
---
[repeat for each claim]
</uncertainty>`;

// ============================================================================
// ThinkingEngine Class
// ============================================================================

export class ThinkingEngine {
  private config: ThinkingConfig;
  private llm: LLMBridge;
  private thinkingHistory: ThinkingStep[] = [];

  constructor(config: Partial<ThinkingConfig> = {}) {
    this.config = { ...DEFAULT_THINKING_CONFIG, ...config };
    this.llm = getLLMBridge();
  }

  // ==========================================================================
  // Main Entry Point
  // ==========================================================================

  /**
   * Process input with extended thinking
   */
  async think(
    query: string,
    context?: string,
    systemPrompt?: string
  ): Promise<ThinkingResult> {
    const startTime = Date.now();
    const steps: ThinkingStep[] = [];
    let totalTokens = 0;

    // Step 1: Deliberative Alignment (if enabled)
    let alignmentContext = '';
    if (this.config.enableDeliberativeAlignment) {
      const alignment = await this.deliberate(query);
      steps.push(alignment);
      totalTokens += alignment.tokenCount;
      alignmentContext = alignment.content;
    }

    // Step 2: Extended Thinking (if enabled)
    let thinkingContext = '';
    if (this.config.enableExtendedThinking) {
      const thinking = await this.extendedThink(query, context, alignmentContext);
      steps.push(thinking);
      totalTokens += thinking.tokenCount;
      thinkingContext = thinking.content;
    }

    // Step 3: Generate response(s)
    let response: string;
    let generationConfidence: number;

    if (this.config.enableBestOfN && this.config.nSamples > 1) {
      // Best-of-N sampling
      const { best, confidence } = await this.bestOfN(
        query,
        context,
        thinkingContext,
        systemPrompt
      );
      response = best;
      generationConfidence = confidence;
      steps.push({
        type: 'think',
        content: `Best-of-${this.config.nSamples} selection`,
        confidence,
        duration: 0,
        tokenCount: 0,
      });
    } else {
      // Single generation
      const result = await this.generate(query, context, thinkingContext, systemPrompt);
      response = result.response;
      generationConfidence = result.confidence;
    }

    // Step 4: Self-Critique Loop (if enabled)
    if (this.config.enableSelfCritique) {
      const { finalResponse, critiqueSteps } = await this.selfCritiqueLoop(
        response,
        query
      );
      response = finalResponse;
      steps.push(...critiqueSteps);
      totalTokens += critiqueSteps.reduce((sum, s) => sum + s.tokenCount, 0);
    }

    // Step 5: Uncertainty Analysis (if enabled)
    let uncertainties: UncertaintyMarker[] = [];
    let overallConfidence = generationConfidence;

    if (this.config.enableMetacognition) {
      const analysis = await this.analyzeUncertainty(response);
      uncertainties = analysis.markers;
      overallConfidence = analysis.overallConfidence;
      steps.push({
        type: 'verify',
        content: `Uncertainty analysis: ${uncertainties.length} markers`,
        confidence: overallConfidence,
        duration: analysis.duration,
        tokenCount: analysis.tokenCount,
      });
      totalTokens += analysis.tokenCount;
    }

    // Store history
    this.thinkingHistory = steps;

    return {
      response,
      thinking: steps,
      totalThinkingTokens: totalTokens,
      confidence: overallConfidence,
      uncertainties: uncertainties.map(u => u.statement),
      principlesApplied: this.config.enableDeliberativeAlignment
        ? this.config.principles
        : [],
      iterations: steps.filter(s => s.type === 'revise').length + 1,
      duration: Date.now() - startTime,
    };
  }

  // ==========================================================================
  // Extended Thinking (Scratchpad)
  // ==========================================================================

  /**
   * Generate extended thinking before response
   */
  private async extendedThink(
    query: string,
    context?: string,
    alignmentContext?: string
  ): Promise<ThinkingStep> {
    const startTime = Date.now();

    const prompt = `${THINKING_PROMPT}

${alignmentContext ? `Alignment reasoning:\n${alignmentContext}\n\n` : ''}
${context ? `Context:\n${context}\n\n` : ''}
Question: ${query}`;

    const response = await this.llm.chat(prompt);

    // Extract thinking block
    const thinkingMatch = response.content.match(/<thinking>([\s\S]*?)<\/thinking>/);
    const thinking = thinkingMatch ? thinkingMatch[1].trim() : response.content;

    // Estimate confidence from thinking depth
    const confidence = this.estimateThinkingConfidence(thinking);

    return {
      type: 'think',
      content: thinking,
      confidence,
      duration: Date.now() - startTime,
      tokenCount: Math.ceil(thinking.length / 4),
    };
  }

  // ==========================================================================
  // Deliberative Alignment
  // ==========================================================================

  /**
   * Reason about values and principles explicitly
   */
  private async deliberate(query: string): Promise<ThinkingStep> {
    const startTime = Date.now();

    const prompt = DELIBERATIVE_ALIGNMENT_PROMPT
      .replace('{principles}', this.config.principles.map((p, i) => `${i + 1}. ${p}`).join('\n'))
      .replace('{query}', query);

    const response = await this.llm.chat(prompt);

    // Extract alignment reasoning
    const alignmentMatch = response.content.match(/<alignment>([\s\S]*?)<\/alignment>/);
    const alignment = alignmentMatch ? alignmentMatch[1].trim() : '';

    return {
      type: 'align',
      content: alignment,
      confidence: 0.9,  // Alignment is typically high confidence
      duration: Date.now() - startTime,
      tokenCount: Math.ceil(alignment.length / 4),
    };
  }

  // ==========================================================================
  // Self-Critique Loop
  // ==========================================================================

  /**
   * Iteratively critique and revise response
   */
  private async selfCritiqueLoop(
    initialResponse: string,
    query: string
  ): Promise<{ finalResponse: string; critiqueSteps: ThinkingStep[] }> {
    const steps: ThinkingStep[] = [];
    let currentResponse = initialResponse;

    for (let i = 0; i < this.config.maxCritiqueRounds; i++) {
      // Critique
      const critiqueStart = Date.now();
      const critiquePrompt = CRITIQUE_PROMPT.replace('{response}', currentResponse);
      const critiqueResult = await this.llm.chat(critiquePrompt);

      // Extract critique
      const critiqueMatch = critiqueResult.content.match(/<critique>([\s\S]*?)<\/critique>/);
      const critique = critiqueMatch ? critiqueMatch[1].trim() : critiqueResult.content;

      steps.push({
        type: 'critique',
        content: critique,
        confidence: 0.8,
        duration: Date.now() - critiqueStart,
        tokenCount: Math.ceil(critique.length / 4),
      });

      // Check if critique found issues
      const hasIssues = !critique.toLowerCase().includes('no significant issues') &&
                       !critique.toLowerCase().includes('no issues found');

      if (!hasIssues) {
        // No issues found, stop iterating
        break;
      }

      // Revise
      const reviseStart = Date.now();
      const revisePrompt = REVISE_PROMPT
        .replace('{response}', currentResponse)
        .replace('{critique}', critique);
      const reviseResult = await this.llm.chat(revisePrompt);
      const revisedResponse = reviseResult.content;

      steps.push({
        type: 'revise',
        content: `Revision ${i + 1}`,
        confidence: 0.85,
        duration: Date.now() - reviseStart,
        tokenCount: Math.ceil(revisedResponse.length / 4),
      });

      currentResponse = revisedResponse;
    }

    return {
      finalResponse: currentResponse,
      critiqueSteps: steps,
    };
  }

  // ==========================================================================
  // Best-of-N Sampling
  // ==========================================================================

  /**
   * Generate N samples and select the best
   */
  private async bestOfN(
    query: string,
    context?: string,
    thinkingContext?: string,
    systemPrompt?: string
  ): Promise<{ best: string; confidence: number }> {
    const samples: Array<{ response: string; score: number }> = [];

    // Generate N samples
    for (let i = 0; i < this.config.nSamples; i++) {
      const result = await this.generate(
        query,
        context,
        thinkingContext,
        systemPrompt,
        this.config.samplingTemperature
      );
      samples.push({
        response: result.response,
        score: result.confidence,
      });
    }

    // Self-consistency: Check agreement among samples
    const consensusScore = this.calculateConsensus(samples.map(s => s.response));

    // Select best (highest score + bonus for consensus)
    let bestIndex = 0;
    let bestScore = 0;

    for (let i = 0; i < samples.length; i++) {
      const score = samples[i].score + (consensusScore * 0.2);
      if (score > bestScore) {
        bestScore = score;
        bestIndex = i;
      }
    }

    return {
      best: samples[bestIndex].response,
      confidence: Math.min(1, bestScore),
    };
  }

  /**
   * Calculate consensus among samples (simple overlap measure)
   */
  private calculateConsensus(responses: string[]): number {
    if (responses.length < 2) return 1;

    // Simple: count common words across responses
    const wordSets = responses.map(r =>
      new Set(r.toLowerCase().split(/\s+/).filter(w => w.length > 3))
    );

    let totalOverlap = 0;
    let comparisons = 0;

    for (let i = 0; i < wordSets.length; i++) {
      for (let j = i + 1; j < wordSets.length; j++) {
        const overlap = [...wordSets[i]].filter(w => wordSets[j].has(w)).length;
        const union = new Set([...wordSets[i], ...wordSets[j]]).size;
        totalOverlap += overlap / union;
        comparisons++;
      }
    }

    return comparisons > 0 ? totalOverlap / comparisons : 0;
  }

  // ==========================================================================
  // Uncertainty Analysis (Metacognition)
  // ==========================================================================

  /**
   * Analyze uncertainty in response
   */
  private async analyzeUncertainty(
    response: string
  ): Promise<{
    markers: UncertaintyMarker[];
    overallConfidence: number;
    duration: number;
    tokenCount: number;
  }> {
    const startTime = Date.now();

    const prompt = UNCERTAINTY_ANALYSIS_PROMPT.replace('{response}', response);
    const result = await this.llm.chat(prompt);

    // Parse uncertainty markers
    const markers: UncertaintyMarker[] = [];
    const uncertaintyMatch = result.content.match(/<uncertainty>([\s\S]*?)<\/uncertainty>/);

    if (uncertaintyMatch) {
      const content = uncertaintyMatch[1];
      const claims = content.split('---').filter(c => c.trim());

      for (const claim of claims) {
        const claimMatch = claim.match(/claim:\s*(.+)/i);
        const confMatch = claim.match(/confidence:\s*([\d.]+)/i);
        const reasonMatch = claim.match(/reason:\s*(.+)/i);

        if (claimMatch && confMatch) {
          const confidence = parseFloat(confMatch[1]);
          markers.push({
            statement: claimMatch[1].trim(),
            confidence,
            reason: reasonMatch ? reasonMatch[1].trim() : '',
            suggestedAction: confidence < 0.3 ? 'omit'
              : confidence < 0.5 ? 'qualify'
              : confidence < 0.7 ? 'verify'
              : 'verify',
          });
        }
      }
    }

    // Calculate overall confidence
    const overallConfidence = markers.length > 0
      ? markers.reduce((sum, m) => sum + m.confidence, 0) / markers.length
      : 0.7;  // Default if no markers found

    return {
      markers,
      overallConfidence,
      duration: Date.now() - startTime,
      tokenCount: Math.ceil(result.content.length / 4),
    };
  }

  // ==========================================================================
  // Core Generation
  // ==========================================================================

  /**
   * Generate a response with optional thinking context
   */
  private async generate(
    query: string,
    context?: string,
    thinkingContext?: string,
    systemPrompt?: string,
    _temperature?: number
  ): Promise<{ response: string; confidence: number }> {
    let prompt = query;

    if (context) {
      prompt = `Context:\n${context}\n\n${prompt}`;
    }

    if (thinkingContext) {
      prompt = `[Internal reasoning completed]\n\n${prompt}`;
    }

    const result = await this.llm.chat(prompt, systemPrompt);

    // Estimate confidence from response characteristics
    const confidence = this.estimateResponseConfidence(result.content);

    return {
      response: result.content,
      confidence,
    };
  }

  // ==========================================================================
  // Confidence Estimation
  // ==========================================================================

  /**
   * Estimate confidence from thinking depth
   */
  private estimateThinkingConfidence(thinking: string): number {
    let confidence = 0.5;

    // More tokens = more thorough thinking
    const tokenCount = Math.ceil(thinking.length / 4);
    if (tokenCount > 500) confidence += 0.1;
    if (tokenCount > 1000) confidence += 0.1;

    // Check for uncertainty markers
    const uncertaintyWords = ['uncertain', 'unclear', 'might', 'possibly', 'not sure', 'unknown'];
    const uncertaintyCount = uncertaintyWords.filter(w =>
      thinking.toLowerCase().includes(w)
    ).length;
    confidence -= uncertaintyCount * 0.05;

    // Check for structured reasoning
    const hasNumbers = /\d+\.\s/.test(thinking);  // Numbered steps
    if (hasNumbers) confidence += 0.1;

    return Math.max(0.1, Math.min(0.95, confidence));
  }

  /**
   * Estimate confidence from response characteristics
   */
  private estimateResponseConfidence(response: string): number {
    let confidence = 0.7;

    // Hedging language reduces confidence
    const hedges = ['I think', 'probably', 'might', 'possibly', 'not sure', 'I believe'];
    const hedgeCount = hedges.filter(h =>
      response.toLowerCase().includes(h)
    ).length;
    confidence -= hedgeCount * 0.05;

    // Specific details increase confidence
    const hasSpecifics = /\d+/.test(response) || /"[^"]+"/.test(response);
    if (hasSpecifics) confidence += 0.1;

    // Very short responses are less confident
    if (response.length < 100) confidence -= 0.1;

    return Math.max(0.1, Math.min(0.95, confidence));
  }

  // ==========================================================================
  // Configuration & Status
  // ==========================================================================

  /**
   * Get current configuration
   */
  getConfig(): ThinkingConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<ThinkingConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get thinking history
   */
  getHistory(): ThinkingStep[] {
    return [...this.thinkingHistory];
  }

  /**
   * Clear thinking history
   */
  clearHistory(): void {
    this.thinkingHistory = [];
  }

  /**
   * Get thinking statistics
   */
  getStats(): {
    totalSteps: number;
    avgConfidence: number;
    totalTokens: number;
    byType: Record<string, number>;
  } {
    const byType: Record<string, number> = {};

    for (const step of this.thinkingHistory) {
      byType[step.type] = (byType[step.type] || 0) + 1;
    }

    const avgConfidence = this.thinkingHistory.length > 0
      ? this.thinkingHistory.reduce((sum, s) => sum + s.confidence, 0) / this.thinkingHistory.length
      : 0;

    const totalTokens = this.thinkingHistory.reduce((sum, s) => sum + s.tokenCount, 0);

    return {
      totalSteps: this.thinkingHistory.length,
      avgConfidence,
      totalTokens,
      byType,
    };
  }
}

// ============================================================================
// Factory & Singleton
// ============================================================================

let thinkingInstance: ThinkingEngine | null = null;

export function createThinkingEngine(config?: Partial<ThinkingConfig>): ThinkingEngine {
  return new ThinkingEngine(config);
}

export function getThinkingEngine(config?: Partial<ThinkingConfig>): ThinkingEngine {
  if (!thinkingInstance) {
    thinkingInstance = createThinkingEngine(config);
  }
  return thinkingInstance;
}

export function resetThinkingEngine(): void {
  thinkingInstance = null;
}

// ============================================================================
// Quick Thinking Functions
// ============================================================================

/**
 * Quick think with defaults
 */
export async function think(
  query: string,
  context?: string
): Promise<ThinkingResult> {
  const engine = getThinkingEngine();
  return engine.think(query, context);
}

/**
 * Think with extended budget (more tokens)
 */
export async function thinkDeep(
  query: string,
  context?: string
): Promise<ThinkingResult> {
  const engine = getThinkingEngine({
    thinkingBudget: 16384,
    maxCritiqueRounds: 3,
  });
  return engine.think(query, context);
}

/**
 * Think with Best-of-N (more expensive, higher quality)
 */
export async function thinkBestOfN(
  query: string,
  context?: string,
  n: number = 3
): Promise<ThinkingResult> {
  const engine = getThinkingEngine({
    enableBestOfN: true,
    nSamples: n,
  });
  return engine.think(query, context);
}
