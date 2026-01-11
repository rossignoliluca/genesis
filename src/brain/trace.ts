/**
 * Genesis Phase 10 - Brain Trace System
 *
 * Visual real-time output of Brain internal processing.
 * Shows thinking progress during reasoning.
 *
 * Usage:
 *   const trace = new BrainTrace(brain);
 *   trace.enable();
 *   await brain.process("query");
 *   trace.disable();
 */

import { Brain, BrainEvent, BrainModule } from './index.js';

// ============================================================================
// Colors
// ============================================================================

const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  italic: '\x1b[3m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  magenta: '\x1b[35m',
  blue: '\x1b[34m',
  gray: '\x1b[90m',
  white: '\x1b[37m',
  bgBlue: '\x1b[44m',
  bgGray: '\x1b[100m',
};

function c(text: string, ...styles: (keyof typeof colors)[]): string {
  const codes = styles.map(s => colors[s]).join('');
  return `${codes}${text}${colors.reset}`;
}

// ============================================================================
// Brain Trace
// ============================================================================

export interface BrainTraceOptions {
  /** Show timing for each step */
  showTiming?: boolean;
  /** Show detailed data */
  showDetails?: boolean;
  /** Indent level for nested output */
  indent?: number;
  /** Prefix for all output */
  prefix?: string;
}

const MODULE_ICONS: Record<BrainModule | string, string> = {
  memory: '🧠',
  llm: '💭',
  grounding: '🔍',
  tools: '🔧',
  healing: '🩹',
  consciousness: '✨',
  kernel: '⚙️',
  done: '✓',
};

const MODULE_COLORS: Record<BrainModule | string, keyof typeof colors> = {
  memory: 'blue',
  llm: 'cyan',
  grounding: 'yellow',
  tools: 'magenta',
  healing: 'red',
  consciousness: 'green',
  kernel: 'gray',
  done: 'green',
};

export class BrainTrace {
  private brain: Brain;
  private options: Required<BrainTraceOptions>;
  private unsubscribe: (() => void) | null = null;
  private enabled = false;
  private cycleStartTime = 0;
  private currentModule: string = '';
  private moduleStartTime = 0;

  constructor(brain: Brain, options: BrainTraceOptions = {}) {
    this.brain = brain;
    this.options = {
      showTiming: options.showTiming ?? true,
      showDetails: options.showDetails ?? true,
      indent: options.indent ?? 2,
      prefix: options.prefix ?? 'BRAIN',
    };
  }

  /**
   * Enable trace output
   */
  enable(): void {
    if (this.enabled) return;

    this.enabled = true;
    this.unsubscribe = this.brain.on(this.handleEvent.bind(this));
  }

  /**
   * Disable trace output
   */
  disable(): void {
    if (!this.enabled) return;

    this.enabled = false;
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
  }

  /**
   * Check if trace is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Toggle trace on/off
   */
  toggle(): boolean {
    if (this.enabled) {
      this.disable();
    } else {
      this.enable();
    }
    return this.enabled;
  }

  /**
   * Handle brain event
   */
  private handleEvent(event: BrainEvent): void {
    switch (event.type) {
      case 'cycle_start':
        this.onCycleStart(event);
        break;
      case 'module_enter':
        this.onModuleEnter(event);
        break;
      case 'module_exit':
        this.onModuleExit(event);
        break;
      case 'memory_recall':
        this.onMemoryRecall(event);
        break;
      case 'memory_anticipate':
        this.onMemoryAnticipate(event);
        break;
      case 'llm_request':
        this.onLLMRequest(event);
        break;
      case 'llm_response':
        this.onLLMResponse(event);
        break;
      case 'grounding_check':
        this.onGroundingCheck(event);
        break;
      case 'tool_execute':
        this.onToolExecute(event);
        break;
      case 'tool_complete':
        this.onToolComplete(event);
        break;
      case 'healing_start':
        this.onHealingStart(event);
        break;
      case 'healing_complete':
        this.onHealingComplete(event);
        break;
      case 'phi_update':
        this.onPhiUpdate(event);
        break;
      case 'broadcast':
        this.onBroadcast(event);
        break;
      case 'cycle_complete':
        this.onCycleComplete(event);
        break;
    }
  }

  // ==========================================================================
  // Event Handlers
  // ==========================================================================

  /**
   * Safely get a value from event.data
   */
  private getData<T>(event: BrainEvent, key: string, defaultValue: T): T {
    const data = event.data as Record<string, unknown> | undefined;
    if (data && key in data) {
      return data[key] as T;
    }
    return defaultValue;
  }

  private onCycleStart(event: BrainEvent): void {
    this.cycleStartTime = Date.now();
    const query = this.getData(event, 'query', '');
    const truncatedQuery = query.length > 50 ? query.substring(0, 50) + '...' : query;

    console.log();
    console.log(this.prefix() + c(' Processing: ', 'bold') + c(`"${truncatedQuery}"`, 'white'));
    console.log(this.prefix() + c(' ─'.repeat(30), 'dim'));
  }

  private onModuleEnter(event: BrainEvent): void {
    const module = event.module || this.getData(event, 'module', 'unknown');
    this.currentModule = module;
    this.moduleStartTime = Date.now();

    const icon = MODULE_ICONS[module] || '•';
    const color = MODULE_COLORS[module] || 'white';
    const moduleName = module.charAt(0).toUpperCase() + module.slice(1);

    console.log(this.prefix() + c(' → ', 'dim') + icon + ' ' + c(moduleName, color, 'bold'));
  }

  private onModuleExit(_event: BrainEvent): void {
    // Module exit is handled implicitly by next module enter or cycle complete
  }

  private onMemoryRecall(event: BrainEvent): void {
    const query = this.getData(event, 'query', '');
    console.log(this.detail(`recall("${this.truncate(query, 30)}")`));
  }

  private onMemoryAnticipate(event: BrainEvent): void {
    const items = this.getData(event, 'items', 0);
    if (items > 0) {
      console.log(this.detail(`↳ anticipated ${items} item(s)`, 'green'));
    }
  }

  private onLLMRequest(_event: BrainEvent): void {
    console.log(this.detail('generating response...'));
  }

  private onLLMResponse(event: BrainEvent): void {
    const length = this.getData(event, 'length', 0);
    const time = this.options.showTiming ? ` (${Date.now() - this.moduleStartTime}ms)` : '';
    console.log(this.detail(`↳ ${length} chars${time}`, 'green'));
  }

  private onGroundingCheck(_event: BrainEvent): void {
    console.log(this.detail('verifying claims...'));
  }

  private onToolExecute(event: BrainEvent): void {
    const count = this.getData(event, 'count', 0);
    console.log(this.detail(`executing ${count} tool(s)...`));
  }

  private onToolComplete(event: BrainEvent): void {
    const results = this.getData(event, 'results', 0);
    const time = this.options.showTiming ? ` (${Date.now() - this.moduleStartTime}ms)` : '';
    console.log(this.detail(`↳ ${results} result(s)${time}`, 'green'));
  }

  private onHealingStart(event: BrainEvent): void {
    const error = this.getData(event, 'error', 'unknown');
    console.log(this.detail(`error: ${this.truncate(String(error), 40)}`, 'red'));
  }

  private onHealingComplete(event: BrainEvent): void {
    const success = this.getData(event, 'success', false);
    if (success) {
      console.log(this.detail('↳ healed successfully', 'green'));
    } else {
      console.log(this.detail('↳ healing failed', 'red'));
    }
  }

  private onPhiUpdate(event: BrainEvent): void {
    const phi = this.getData(event, 'phi', 0);
    const bar = this.renderPhiMini(phi);
    const status = phi > 0.3 ? c('ignited', 'green') : c('local', 'dim');
    console.log(this.detail(`φ=${phi.toFixed(2)} ${bar} ${status}`));
  }

  private onBroadcast(event: BrainEvent): void {
    const source = this.getData(event, 'source', 'unknown');
    console.log(this.detail(`↳ broadcast from ${source}`, 'cyan'));
  }

  private onCycleComplete(event: BrainEvent): void {
    const transitions = this.getData(event, 'transitions', 0);
    const totalTime = Date.now() - this.cycleStartTime;
    const state = this.getData<Record<string, unknown> | null>(event, 'state', null);

    // Final phi status
    const phi = (state?.phi as number) ?? 0;
    const phiStatus = phi > 0.3 ? c('✨ ignited', 'green') : c('◌ local', 'dim');

    console.log(this.prefix() + c(' ─'.repeat(30), 'dim'));
    console.log(this.prefix() + c(' ✓ ', 'green', 'bold') +
      c(`Done`, 'green') +
      c(` (${totalTime}ms, ${transitions} transitions, ${phiStatus})`, 'dim'));
    console.log();
  }

  // ==========================================================================
  // Helpers
  // ==========================================================================

  /**
   * Format prefix
   */
  private prefix(): string {
    return c(`[${this.options.prefix}]`, 'cyan', 'bold');
  }

  /**
   * Format detail line (indented)
   */
  private detail(text: string, color: keyof typeof colors = 'dim'): string {
    const indent = ' '.repeat(this.options.indent + 4);
    return this.prefix() + indent + c(text, color);
  }

  /**
   * Truncate string
   */
  private truncate(str: string, max: number): string {
    if (str.length <= max) return str;
    return str.substring(0, max) + '...';
  }

  /**
   * Render mini phi bar
   */
  private renderPhiMini(phi: number): string {
    const width = 10;
    const filled = Math.round(phi * width);
    const empty = width - filled;

    if (phi >= 0.7) return c('█'.repeat(filled), 'green') + c('░'.repeat(empty), 'dim');
    if (phi >= 0.3) return c('█'.repeat(filled), 'yellow') + c('░'.repeat(empty), 'dim');
    return c('█'.repeat(filled), 'gray') + c('░'.repeat(empty), 'dim');
  }
}

// ============================================================================
// Factory
// ============================================================================

export function createBrainTrace(brain: Brain, options?: BrainTraceOptions): BrainTrace {
  return new BrainTrace(brain, options);
}

// Singleton instance management
let traceInstance: BrainTrace | null = null;

export function getBrainTrace(brain?: Brain): BrainTrace | null {
  if (!traceInstance && brain) {
    traceInstance = createBrainTrace(brain);
  }
  return traceInstance;
}

export function resetBrainTrace(): void {
  if (traceInstance) {
    traceInstance.disable();
    traceInstance = null;
  }
}
