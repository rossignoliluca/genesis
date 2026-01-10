/**
 * Genesis 6.0 - Human-in-the-Loop Module
 *
 * Enables human intervention at critical decision points:
 * - Confirmation for destructive operations
 * - Clarification when intent is unclear
 * - Choice selection from options
 * - Free-form input for open questions
 *
 * Follows the principle: "When in doubt, ask the human."
 */

import * as readline from 'readline';

// ============================================================================
// Types
// ============================================================================

export type QuestionType = 'confirm' | 'choice' | 'text' | 'multiChoice';

export interface Question {
  /** Question type */
  type: QuestionType;
  /** Question text */
  text: string;
  /** Optional header/label */
  header?: string;
  /** Options for choice/multiChoice */
  options?: QuestionOption[];
  /** Default value */
  default?: string | boolean | string[];
  /** Whether this question is required */
  required?: boolean;
  /** Timeout in ms (0 = no timeout) */
  timeout?: number;
  /** Context for why we're asking */
  context?: string;
}

export interface QuestionOption {
  /** Option value */
  value: string;
  /** Display label */
  label: string;
  /** Optional description */
  description?: string;
  /** Whether this is the recommended option */
  recommended?: boolean;
}

export interface Answer {
  /** The question that was asked */
  question: Question;
  /** The answer value */
  value: string | boolean | string[];
  /** Whether the user responded (vs timeout/cancel) */
  responded: boolean;
  /** Time taken to respond in ms */
  responseTime: number;
  /** Was this a timeout? */
  timedOut?: boolean;
  /** Was this cancelled? */
  cancelled?: boolean;
}

export interface HumanLoopConfig {
  /** Default timeout for questions (0 = no timeout) */
  defaultTimeout: number;
  /** Whether to allow skipping questions */
  allowSkip: boolean;
  /** Callback when human responds */
  onResponse?: (answer: Answer) => void;
  /** Use colors in output */
  useColors: boolean;
  /** Custom readline interface */
  rl?: readline.Interface;
}

// ============================================================================
// Colors
// ============================================================================

const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  magenta: '\x1b[35m',
  blue: '\x1b[34m',
};

function c(text: string, color: keyof typeof colors, useColors: boolean): string {
  if (!useColors) return text;
  return `${colors[color]}${text}${colors.reset}`;
}

// ============================================================================
// Default Config
// ============================================================================

const DEFAULT_CONFIG: HumanLoopConfig = {
  defaultTimeout: 0,
  allowSkip: true,
  useColors: true,
};

// ============================================================================
// HumanLoop Class
// ============================================================================

export class HumanLoop {
  private config: HumanLoopConfig;
  private rl: readline.Interface | null = null;
  private ownRl = false;
  private history: Answer[] = [];

  constructor(config?: Partial<HumanLoopConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    if (config?.rl) {
      this.rl = config.rl;
      this.ownRl = false;
    }
  }

  /**
   * Initialize readline if needed
   */
  private ensureRl(): readline.Interface {
    if (!this.rl) {
      this.rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });
      this.ownRl = true;
    }
    return this.rl;
  }

  /**
   * Ask a question and wait for response
   */
  async ask(question: Question): Promise<Answer> {
    const startTime = Date.now();
    const rl = this.ensureRl();

    // Print context if provided
    if (question.context) {
      console.log(c(`\n${question.context}`, 'dim', this.config.useColors));
    }

    // Route to appropriate handler
    let answer: Answer;

    switch (question.type) {
      case 'confirm':
        answer = await this.askConfirm(question, rl);
        break;
      case 'choice':
        answer = await this.askChoice(question, rl);
        break;
      case 'multiChoice':
        answer = await this.askMultiChoice(question, rl);
        break;
      case 'text':
      default:
        answer = await this.askText(question, rl);
        break;
    }

    answer.responseTime = Date.now() - startTime;
    this.history.push(answer);

    // Callback
    if (this.config.onResponse) {
      this.config.onResponse(answer);
    }

    return answer;
  }

  /**
   * Ask a yes/no confirmation
   */
  private askConfirm(question: Question, rl: readline.Interface): Promise<Answer> {
    return new Promise((resolve) => {
      const defaultStr = question.default === true ? 'Y/n' : 'y/N';
      const prompt = `${c('?', 'yellow', this.config.useColors)} ${question.text} [${defaultStr}] `;

      const timeout = question.timeout || this.config.defaultTimeout;
      let timer: NodeJS.Timeout | null = null;

      if (timeout > 0) {
        timer = setTimeout(() => {
          console.log(c('\n(Timeout - using default)', 'dim', this.config.useColors));
          resolve({
            question,
            value: question.default ?? false,
            responded: false,
            timedOut: true,
            responseTime: timeout,
          });
        }, timeout);
      }

      rl.question(prompt, (input) => {
        if (timer) clearTimeout(timer);

        const normalized = input.trim().toLowerCase();
        let value: boolean;

        if (normalized === '') {
          value = (question.default as boolean) ?? false;
        } else if (normalized === 'y' || normalized === 'yes' || normalized === 'sì' || normalized === 'si') {
          value = true;
        } else {
          value = false;
        }

        resolve({
          question,
          value,
          responded: true,
          responseTime: 0,
        });
      });
    });
  }

  /**
   * Ask to choose one option
   */
  private askChoice(question: Question, rl: readline.Interface): Promise<Answer> {
    return new Promise((resolve) => {
      const options = question.options || [];

      // Print options
      console.log(c(`\n${question.text}`, 'cyan', this.config.useColors));

      for (let i = 0; i < options.length; i++) {
        const opt = options[i];
        const num = c(`  ${i + 1}.`, 'bold', this.config.useColors);
        const label = opt.recommended
          ? c(`${opt.label} (Recommended)`, 'green', this.config.useColors)
          : opt.label;
        const desc = opt.description
          ? c(` - ${opt.description}`, 'dim', this.config.useColors)
          : '';

        console.log(`${num} ${label}${desc}`);
      }

      if (this.config.allowSkip) {
        console.log(c(`  0. Skip`, 'dim', this.config.useColors));
      }

      const defaultIdx = options.findIndex(o => o.value === question.default);
      const defaultStr = defaultIdx >= 0 ? ` (default: ${defaultIdx + 1})` : '';

      const prompt = `${c('>', 'yellow', this.config.useColors)} Choose${defaultStr}: `;

      rl.question(prompt, (input) => {
        const num = parseInt(input.trim(), 10);

        if (isNaN(num) && defaultIdx >= 0) {
          // Use default
          resolve({
            question,
            value: options[defaultIdx].value,
            responded: true,
            responseTime: 0,
          });
        } else if (num === 0 && this.config.allowSkip) {
          resolve({
            question,
            value: '',
            responded: true,
            cancelled: true,
            responseTime: 0,
          });
        } else if (num >= 1 && num <= options.length) {
          resolve({
            question,
            value: options[num - 1].value,
            responded: true,
            responseTime: 0,
          });
        } else {
          // Invalid, use first option
          console.log(c('Invalid choice, using first option.', 'yellow', this.config.useColors));
          resolve({
            question,
            value: options[0]?.value || '',
            responded: true,
            responseTime: 0,
          });
        }
      });
    });
  }

  /**
   * Ask to choose multiple options
   */
  private askMultiChoice(question: Question, rl: readline.Interface): Promise<Answer> {
    return new Promise((resolve) => {
      const options = question.options || [];

      // Print options
      console.log(c(`\n${question.text}`, 'cyan', this.config.useColors));
      console.log(c('(Enter comma-separated numbers, e.g., 1,3,4)', 'dim', this.config.useColors));

      for (let i = 0; i < options.length; i++) {
        const opt = options[i];
        const num = c(`  ${i + 1}.`, 'bold', this.config.useColors);
        const label = opt.label;
        const desc = opt.description
          ? c(` - ${opt.description}`, 'dim', this.config.useColors)
          : '';

        console.log(`${num} ${label}${desc}`);
      }

      const prompt = `${c('>', 'yellow', this.config.useColors)} Choose: `;

      rl.question(prompt, (input) => {
        const nums = input.split(',')
          .map(s => parseInt(s.trim(), 10))
          .filter(n => !isNaN(n) && n >= 1 && n <= options.length);

        const values = nums.map(n => options[n - 1].value);

        resolve({
          question,
          value: values,
          responded: true,
          responseTime: 0,
        });
      });
    });
  }

  /**
   * Ask for free-form text input
   */
  private askText(question: Question, rl: readline.Interface): Promise<Answer> {
    return new Promise((resolve) => {
      const defaultStr = question.default ? ` (${question.default})` : '';
      const prompt = `${c('?', 'yellow', this.config.useColors)} ${question.text}${defaultStr}: `;

      rl.question(prompt, (input) => {
        const value = input.trim() || (question.default as string) || '';

        resolve({
          question,
          value,
          responded: true,
          responseTime: 0,
        });
      });
    });
  }

  // ==========================================================================
  // Convenience Methods
  // ==========================================================================

  /**
   * Quick confirmation
   */
  async confirm(text: string, defaultValue = false): Promise<boolean> {
    const answer = await this.ask({
      type: 'confirm',
      text,
      default: defaultValue,
    });
    return answer.value as boolean;
  }

  /**
   * Quick choice
   */
  async choose(text: string, options: string[]): Promise<string> {
    const answer = await this.ask({
      type: 'choice',
      text,
      options: options.map(o => ({ value: o, label: o })),
    });
    return answer.value as string;
  }

  /**
   * Quick text input
   */
  async input(text: string, defaultValue?: string): Promise<string> {
    const answer = await this.ask({
      type: 'text',
      text,
      default: defaultValue,
    });
    return answer.value as string;
  }

  /**
   * Ask for confirmation before destructive operation
   */
  async confirmDestructive(operation: string, details?: string): Promise<boolean> {
    console.log(c('\n⚠️  DESTRUCTIVE OPERATION', 'red', this.config.useColors));
    console.log(c(`Operation: ${operation}`, 'yellow', this.config.useColors));

    if (details) {
      console.log(c(`Details: ${details}`, 'dim', this.config.useColors));
    }

    return this.confirm('Are you sure you want to proceed?', false);
  }

  /**
   * Ask for clarification
   */
  async clarify(context: string, options?: QuestionOption[]): Promise<string> {
    if (options && options.length > 0) {
      const answer = await this.ask({
        type: 'choice',
        text: 'Please clarify your intent:',
        context,
        options,
      });
      return answer.value as string;
    } else {
      const answer = await this.ask({
        type: 'text',
        text: 'Please provide more details:',
        context,
      });
      return answer.value as string;
    }
  }

  /**
   * Present implementation options
   */
  async chooseApproach(
    task: string,
    approaches: Array<{ name: string; description: string; recommended?: boolean }>
  ): Promise<string> {
    const answer = await this.ask({
      type: 'choice',
      text: `How would you like to approach: "${task}"?`,
      options: approaches.map(a => ({
        value: a.name,
        label: a.name,
        description: a.description,
        recommended: a.recommended,
      })),
    });
    return answer.value as string;
  }

  // ==========================================================================
  // History & State
  // ==========================================================================

  /**
   * Get answer history
   */
  getHistory(): Answer[] {
    return [...this.history];
  }

  /**
   * Clear history
   */
  clearHistory(): void {
    this.history = [];
  }

  /**
   * Get statistics
   */
  stats(): {
    totalQuestions: number;
    responded: number;
    timedOut: number;
    cancelled: number;
    avgResponseTime: number;
  } {
    const responded = this.history.filter(a => a.responded && !a.cancelled && !a.timedOut).length;
    const timedOut = this.history.filter(a => a.timedOut).length;
    const cancelled = this.history.filter(a => a.cancelled).length;
    const avgResponseTime = this.history.length > 0
      ? this.history.reduce((sum, a) => sum + a.responseTime, 0) / this.history.length
      : 0;

    return {
      totalQuestions: this.history.length,
      responded,
      timedOut,
      cancelled,
      avgResponseTime,
    };
  }

  /**
   * Close (cleanup readline if we created it)
   */
  close(): void {
    if (this.ownRl && this.rl) {
      this.rl.close();
      this.rl = null;
    }
  }
}

// ============================================================================
// Singleton
// ============================================================================

let humanLoopInstance: HumanLoop | null = null;

export function getHumanLoop(config?: Partial<HumanLoopConfig>): HumanLoop {
  if (!humanLoopInstance) {
    humanLoopInstance = new HumanLoop(config);
  }
  return humanLoopInstance;
}

export function resetHumanLoop(): void {
  if (humanLoopInstance) {
    humanLoopInstance.close();
    humanLoopInstance = null;
  }
}

// ============================================================================
// Tool Registration
// ============================================================================

import { toolRegistry, Tool } from '../tools/index.js';

/**
 * AskUser tool - for LLM to request human input
 */
const askUserTool: Tool = {
  name: 'ask_user',
  description: 'Ask the user a question and wait for their response',
  execute: async (params: Record<string, unknown>) => {
    const humanLoop = getHumanLoop();

    const type = (params.type as QuestionType) || 'text';
    const text = params.text as string || params.question as string || 'Please respond:';
    const options = params.options as QuestionOption[] | undefined;
    const context = params.context as string | undefined;
    const defaultValue = params.default as string | boolean | undefined;

    const answer = await humanLoop.ask({
      type,
      text,
      options,
      context,
      default: defaultValue,
    });

    return {
      success: answer.responded,
      answer: answer.value,
      cancelled: answer.cancelled,
      timedOut: answer.timedOut,
    };
  },
  validate: (params: Record<string, unknown>) => {
    const text = params.text || params.question;
    if (!text) {
      return { valid: false, reason: 'Missing question text' };
    }
    return { valid: true };
  },
};

/**
 * Confirm tool - quick yes/no confirmation
 */
const confirmTool: Tool = {
  name: 'confirm',
  description: 'Ask the user for yes/no confirmation',
  execute: async (params: Record<string, unknown>) => {
    const humanLoop = getHumanLoop();
    const text = params.text as string || params.question as string || 'Do you confirm?';
    const defaultValue = params.default as boolean ?? false;

    const confirmed = await humanLoop.confirm(text, defaultValue);

    return {
      success: true,
      confirmed,
    };
  },
};

// Register tools
toolRegistry.set('ask_user', askUserTool);
toolRegistry.set('confirm', confirmTool);

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Quick confirmation
 */
export async function confirm(text: string, defaultValue = false): Promise<boolean> {
  return getHumanLoop().confirm(text, defaultValue);
}

/**
 * Quick choice
 */
export async function choose(text: string, options: string[]): Promise<string> {
  return getHumanLoop().choose(text, options);
}

/**
 * Quick text input
 */
export async function input(text: string, defaultValue?: string): Promise<string> {
  return getHumanLoop().input(text, defaultValue);
}

/**
 * Confirm destructive operation
 */
export async function confirmDestructive(operation: string, details?: string): Promise<boolean> {
  return getHumanLoop().confirmDestructive(operation, details);
}

/**
 * Ask for clarification
 */
export async function clarify(context: string, options?: QuestionOption[]): Promise<string> {
  return getHumanLoop().clarify(context, options);
}
