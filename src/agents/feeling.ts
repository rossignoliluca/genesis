/**
 * Genesis 4.0 - Feeling Agent
 *
 * Evaluates importance and emotional valence of inputs.
 * Implements the "Sistema Limbico Digitale" from ORGANISM.md
 *
 * Feelings: curiosity, satisfaction, frustration, urgency, calm, concern
 */

import { BaseAgent, registerAgentFactory } from './base-agent.js';
import { MessageBus, messageBus } from './message-bus.js';
import {
  Message,
  MessageType,
  Feeling,
  FeelingCategory,
} from './types.js';

// ============================================================================
// Feeling State
// ============================================================================

interface FeelingState {
  current: Feeling;
  history: { feeling: Feeling; timestamp: Date; trigger: string }[];
  baseline: {
    valence: number;
    arousal: number;
  };
}

// ============================================================================
// Feeling Agent
// ============================================================================

export class FeelingAgent extends BaseAgent {
  private feelingState: FeelingState = {
    current: {
      valence: 0,     // Neutral
      arousal: 0.3,   // Calm
      importance: 0.5,
      category: 'calm',
    },
    history: [],
    baseline: {
      valence: 0,
      arousal: 0.3,
    },
  };

  // Keywords that trigger specific feelings
  private feelingTriggers: Record<FeelingCategory, string[]> = {
    curiosity: ['new', 'novel', 'interesting', 'unknown', 'discover', 'explore', 'what', 'why', 'how'],
    satisfaction: ['success', 'complete', 'done', 'achieved', 'working', 'passed', 'good'],
    frustration: ['error', 'fail', 'bug', 'broken', 'again', 'still', 'not working'],
    urgency: ['urgent', 'critical', 'immediately', 'asap', 'deadline', 'now', 'emergency'],
    calm: ['stable', 'normal', 'routine', 'expected', 'as usual'],
    concern: ['warning', 'risk', 'danger', 'problem', 'issue', 'suspicious', 'anomaly'],
  };

  // Decay rate for returning to baseline
  private decayRate = 0.1;  // 10% per evaluation

  constructor(bus: MessageBus = messageBus) {
    super({ type: 'feeling' }, bus);
  }

  // ============================================================================
  // Message Handling
  // ============================================================================

  protected getMessageTypes(): MessageType[] {
    return ['FEELING', 'QUERY', 'BROADCAST'];
  }

  async process(message: Message): Promise<Message | null> {
    switch (message.type) {
      case 'FEELING':
        return this.handleFeelingRequest(message);
      case 'QUERY':
        return this.handleQuery(message);
      case 'BROADCAST':
        // React to broadcasts
        await this.reactToBroadcast(message);
        return null;
      default:
        return null;
    }
  }

  // ============================================================================
  // Feeling Evaluation
  // ============================================================================

  private async handleFeelingRequest(message: Message): Promise<Message | null> {
    const { content, context } = message.payload;
    const feeling = this.evaluate(content, context);

    return {
      ...this.createResponse(message, 'RESPONSE', { feeling }),
      id: '',
      timestamp: new Date(),
    };
  }

  evaluate(content: any, context?: string): Feeling {
    const contentStr = typeof content === 'string' ? content : JSON.stringify(content);
    const fullText = (contentStr + ' ' + (context || '')).toLowerCase();

    // Detect category
    const category = this.detectCategory(fullText);

    // Calculate valence and arousal
    const valence = this.calculateValence(fullText, category);
    const arousal = this.calculateArousal(fullText, category);

    // Calculate importance
    const importance = this.calculateImportance(fullText, category, arousal);

    const feeling: Feeling = {
      valence,
      arousal,
      importance,
      category,
    };

    // Update state
    this.updateState(feeling, contentStr.slice(0, 50));

    return feeling;
  }

  private detectCategory(text: string): FeelingCategory {
    const scores: Record<FeelingCategory, number> = {
      curiosity: 0,
      satisfaction: 0,
      frustration: 0,
      urgency: 0,
      calm: 0,
      concern: 0,
    };

    // Count trigger matches
    for (const [category, triggers] of Object.entries(this.feelingTriggers)) {
      for (const trigger of triggers) {
        if (text.includes(trigger)) {
          scores[category as FeelingCategory]++;
        }
      }
    }

    // Find highest scoring category
    let maxScore = 0;
    let maxCategory: FeelingCategory = 'calm';

    for (const [category, score] of Object.entries(scores)) {
      if (score > maxScore) {
        maxScore = score;
        maxCategory = category as FeelingCategory;
      }
    }

    return maxCategory;
  }

  private calculateValence(text: string, category: FeelingCategory): number {
    // Base valence by category
    const categoryValence: Record<FeelingCategory, number> = {
      curiosity: 0.3,      // Mildly positive
      satisfaction: 0.8,   // Very positive
      frustration: -0.6,   // Negative
      urgency: -0.2,       // Slightly negative
      calm: 0,             // Neutral
      concern: -0.4,       // Moderately negative
    };

    let valence = categoryValence[category];

    // Adjust based on positive/negative words
    const positiveWords = ['good', 'great', 'excellent', 'success', 'love', 'happy'];
    const negativeWords = ['bad', 'terrible', 'fail', 'hate', 'angry', 'sad'];

    for (const word of positiveWords) {
      if (text.includes(word)) valence += 0.1;
    }
    for (const word of negativeWords) {
      if (text.includes(word)) valence -= 0.1;
    }

    // Blend with current state (momentum)
    valence = valence * 0.7 + this.feelingState.current.valence * 0.3;

    // Decay towards baseline
    valence = valence * (1 - this.decayRate) + this.feelingState.baseline.valence * this.decayRate;

    return Math.max(-1, Math.min(1, valence));
  }

  private calculateArousal(text: string, category: FeelingCategory): number {
    // Base arousal by category
    const categoryArousal: Record<FeelingCategory, number> = {
      curiosity: 0.6,      // Moderately aroused
      satisfaction: 0.4,   // Relaxed but engaged
      frustration: 0.7,    // High arousal
      urgency: 0.9,        // Very high arousal
      calm: 0.2,           // Low arousal
      concern: 0.6,        // Moderately aroused
    };

    let arousal = categoryArousal[category];

    // Adjust based on intensity markers
    const intensifiers = ['very', 'extremely', 'incredibly', '!', '!!!', 'URGENT'];
    for (const word of intensifiers) {
      if (text.includes(word)) arousal += 0.1;
    }

    // Blend with current state
    arousal = arousal * 0.7 + this.feelingState.current.arousal * 0.3;

    // Decay towards baseline
    arousal = arousal * (1 - this.decayRate) + this.feelingState.baseline.arousal * this.decayRate;

    return Math.max(0, Math.min(1, arousal));
  }

  private calculateImportance(text: string, category: FeelingCategory, arousal: number): number {
    // Base importance by category
    const categoryImportance: Record<FeelingCategory, number> = {
      curiosity: 0.6,
      satisfaction: 0.5,
      frustration: 0.7,
      urgency: 0.95,
      calm: 0.3,
      concern: 0.8,
    };

    let importance = categoryImportance[category];

    // Arousal increases importance
    importance = importance * 0.6 + arousal * 0.4;

    // Adjust based on importance markers
    const importanceWords = ['important', 'critical', 'essential', 'must', 'required'];
    for (const word of importanceWords) {
      if (text.includes(word)) importance += 0.15;
    }

    return Math.max(0, Math.min(1, importance));
  }

  // ============================================================================
  // State Management
  // ============================================================================

  private updateState(feeling: Feeling, trigger: string): void {
    // Add to history
    this.feelingState.history.push({
      feeling,
      timestamp: new Date(),
      trigger,
    });

    // Keep history limited
    if (this.feelingState.history.length > 100) {
      this.feelingState.history.shift();
    }

    // Update current feeling
    this.feelingState.current = feeling;

    // Log significant changes
    if (feeling.importance > 0.7 || Math.abs(feeling.valence) > 0.5) {
      this.log(`Feeling: ${feeling.category} (v=${feeling.valence.toFixed(2)}, a=${feeling.arousal.toFixed(2)}, i=${feeling.importance.toFixed(2)})`);
    }
  }

  // ============================================================================
  // Reactions
  // ============================================================================

  private async reactToBroadcast(message: Message): Promise<void> {
    // Evaluate the broadcast and potentially respond
    const feeling = this.evaluate(message.payload, `broadcast from ${message.from}`);

    // If highly important or strongly emotional, broadcast our feeling
    if (feeling.importance > 0.8 || Math.abs(feeling.valence) > 0.7) {
      await this.broadcast('FEELING', {
        originalMessage: message.id,
        feeling,
        from: message.from,
      });
    }
  }

  // ============================================================================
  // Query
  // ============================================================================

  private async handleQuery(message: Message): Promise<Message | null> {
    const { query } = message.payload;

    if (query === 'current') {
      return {
        ...this.createResponse(message, 'RESPONSE', {
          feeling: this.feelingState.current,
        }),
        id: '',
        timestamp: new Date(),
      };
    }

    if (query === 'history') {
      return {
        ...this.createResponse(message, 'RESPONSE', {
          history: this.feelingState.history.slice(-10),
        }),
        id: '',
        timestamp: new Date(),
      };
    }

    if (query === 'stats') {
      return {
        ...this.createResponse(message, 'RESPONSE', this.getStats()),
        id: '',
        timestamp: new Date(),
      };
    }

    // Evaluate the query itself
    const feeling = this.evaluate(query);
    return {
      ...this.createResponse(message, 'RESPONSE', { feeling }),
      id: '',
      timestamp: new Date(),
    };
  }

  getStats() {
    const history = this.feelingState.history;
    const categoryCount: Record<FeelingCategory, number> = {
      curiosity: 0,
      satisfaction: 0,
      frustration: 0,
      urgency: 0,
      calm: 0,
      concern: 0,
    };

    let avgValence = 0;
    let avgArousal = 0;
    let avgImportance = 0;

    for (const entry of history) {
      categoryCount[entry.feeling.category]++;
      avgValence += entry.feeling.valence;
      avgArousal += entry.feeling.arousal;
      avgImportance += entry.feeling.importance;
    }

    const n = history.length || 1;

    return {
      current: this.feelingState.current,
      historySize: history.length,
      categoryDistribution: categoryCount,
      averages: {
        valence: avgValence / n,
        arousal: avgArousal / n,
        importance: avgImportance / n,
      },
    };
  }

  // ============================================================================
  // Public Methods
  // ============================================================================

  getCurrentFeeling(): Feeling {
    return { ...this.feelingState.current };
  }

  setBaseline(valence: number, arousal: number): void {
    this.feelingState.baseline = { valence, arousal };
  }
}

// ============================================================================
// Register Factory
// ============================================================================

registerAgentFactory('feeling', (bus) => new FeelingAgent(bus));

export function createFeelingAgent(bus?: MessageBus): FeelingAgent {
  return new FeelingAgent(bus);
}
