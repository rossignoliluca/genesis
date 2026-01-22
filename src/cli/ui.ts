/**
 * Genesis v7.20 - Modern UI Components
 *
 * Beautiful, elegant terminal interface with:
 * - Rich colors and Unicode characters
 * - Thinking/reasoning visualization
 * - Agent call tree
 * - Real-time code changes
 * - Interactive menus
 */

// ============================================================================
// Colors & Styles
// ============================================================================

export const COLORS = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  italic: '\x1b[3m',
  underline: '\x1b[4m',
  inverse: '\x1b[7m',
  hidden: '\x1b[8m',
  strikethrough: '\x1b[9m',

  // Foreground
  black: '\x1b[30m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m',

  // Background
  bgBlack: '\x1b[40m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
  bgBlue: '\x1b[44m',
  bgMagenta: '\x1b[45m',
  bgCyan: '\x1b[46m',
  bgWhite: '\x1b[47m',
  bgGray: '\x1b[100m',
} as const;

export type ColorName = keyof typeof COLORS;

/**
 * Apply multiple styles to text
 */
export function style(text: string, ...styles: ColorName[]): string {
  if (styles.length === 0) return text;
  const codes = styles.map(s => COLORS[s]).join('');
  return `${codes}${text}${COLORS.reset}`;
}

/**
 * Single color function (backwards compatible)
 */
export function c(text: string, color: ColorName): string {
  return style(text, color);
}

// Semantic colors
export const success = (text: string) => style(text, 'green');
export const error = (text: string) => style(text, 'red');
export const warning = (text: string) => style(text, 'yellow');
export const info = (text: string) => style(text, 'cyan');
export const muted = (text: string) => style(text, 'dim');
export const highlight = (text: string) => style(text, 'bold', 'cyan');

// ============================================================================
// v7.24: User-Friendly Messages
// ============================================================================

/**
 * Print a friendly status message with icon
 */
export function printStatus(message: string, type: 'ok' | 'warn' | 'error' | 'info' | 'loading' = 'info'): void {
  const icons = {
    ok: style('✓', 'green'),
    warn: style('⚠', 'yellow'),
    error: style('✗', 'red'),
    info: style('ℹ', 'cyan'),
    loading: style('◌', 'dim'),
  };
  console.log(`${icons[type]} ${message}`);
}

/**
 * Print a friendly error with suggestion
 */
export function printError(message: string, suggestion?: string): void {
  console.log(`${style('✗', 'red')} ${style(message, 'red')}`);
  if (suggestion) {
    console.log(`  ${style('→', 'dim')} ${style(suggestion, 'dim')}`);
  }
}

/**
 * Print a success message
 */
export function printSuccess(message: string): void {
  console.log(`${style('✓', 'green')} ${message}`);
}

/**
 * Print a hint/tip
 */
export function printHint(message: string): void {
  console.log(`${style('💡', 'yellow')} ${style(message, 'dim')}`);
}

/**
 * Print quick help for a command
 */
export function printQuickHelp(commands: Array<{ cmd: string; desc: string }>): void {
  console.log();
  for (const { cmd, desc } of commands) {
    console.log(`  ${style(cmd, 'yellow')} ${style('-', 'dim')} ${style(desc, 'dim')}`);
  }
  console.log();
}

// ============================================================================
// Spinner
// ============================================================================

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

export class Spinner {
  private interval: NodeJS.Timeout | null = null;
  private frame = 0;
  private message: string;
  private running = false;

  constructor(message: string = 'Processing') {
    this.message = message;
  }

  start(message?: string): void {
    if (this.running) return;
    if (message) this.message = message;
    this.running = true;
    this.frame = 0;

    // Initial render
    process.stdout.write(`${style(SPINNER_FRAMES[0], 'cyan')} ${muted(this.message + '...')}`);

    this.interval = setInterval(() => {
      this.frame = (this.frame + 1) % SPINNER_FRAMES.length;
      process.stdout.write(`\r${style(SPINNER_FRAMES[this.frame], 'cyan')} ${muted(this.message + '...')}`);
    }, 80);
  }

  update(message: string): void {
    this.message = message;
    if (this.running) {
      process.stdout.write(`\r${style(SPINNER_FRAMES[this.frame], 'cyan')} ${muted(this.message + '...')}${' '.repeat(20)}`);
    }
  }

  stop(finalMessage?: string, status: 'success' | 'error' | 'warning' | 'info' = 'success'): void {
    if (!this.running) return;
    this.running = false;

    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }

    const icons = {
      success: style('✓', 'green'),
      error: style('✗', 'red'),
      warning: style('!', 'yellow'),
      info: style('i', 'cyan'),
    };

    // Clear line and print final message
    process.stdout.write('\r\x1b[K'); // Clear line
    if (finalMessage) {
      console.log(`${icons[status]} ${finalMessage}`);
    }
  }

  isRunning(): boolean {
    return this.running;
  }
}

// ============================================================================
// Thinking Spinner (v7.3.8) - Shows time, module path, and current action
// ============================================================================

const MODULE_ICONS: Record<string, string> = {
  memory: '🧠',
  llm: '💭',
  grounding: '🔍',
  tools: '🔧',
  healing: '🩹',
  consciousness: '✨',
  kernel: '⚙️',
  done: '✓',
};

const MODULE_NAMES: Record<string, string> = {
  memory: 'Recalling',
  llm: 'Thinking',
  grounding: 'Verifying',
  tools: 'Executing',
  healing: 'Healing',
  consciousness: 'Integrating',
  kernel: 'Coordinating',
};

export class ThinkingSpinner {
  private interval: NodeJS.Timeout | null = null;
  private frame = 0;
  private running = false;
  private startTime = 0;
  private currentModule = '';
  private currentAction = '';
  private modulePath: string[] = [];

  start(): void {
    if (this.running) return;
    this.running = true;
    this.startTime = Date.now();
    this.frame = 0;
    this.modulePath = [];
    this.currentModule = '';
    this.currentAction = 'Initializing';

    this.render();
    this.interval = setInterval(() => {
      this.frame = (this.frame + 1) % SPINNER_FRAMES.length;
      this.render();
    }, 80);
  }

  private render(): void {
    const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(1);
    const icon = MODULE_ICONS[this.currentModule] || '○';
    const moduleName = MODULE_NAMES[this.currentModule] || this.currentModule || 'Processing';

    // Build module path display (e.g., "memory → llm → tools")
    const pathStr = this.modulePath.length > 0
      ? ` ${style(this.modulePath.join(' → '), 'dim')}`
      : '';

    // Build action display
    const actionStr = this.currentAction
      ? ` ${style('· ' + this.currentAction, 'dim')}`
      : '';

    const line = `${style(SPINNER_FRAMES[this.frame], 'cyan')} ${style(`[${elapsed}s]`, 'yellow')} ${icon} ${moduleName}${actionStr}${pathStr}`;

    process.stdout.write(`\r\x1b[K${line}`);
  }

  setModule(module: string): void {
    if (module && module !== 'done' && module !== this.currentModule) {
      this.currentModule = module;
      if (!this.modulePath.includes(module)) {
        this.modulePath.push(module);
      }
    }
    if (this.running) this.render();
  }

  setAction(action: string): void {
    this.currentAction = action;
    if (this.running) this.render();
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;

    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }

    const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(1);
    process.stdout.write(`\r\x1b[K`); // Clear line

    // Optional: show final summary
    // console.log(`${style('✓', 'green')} Completed in ${elapsed}s [${this.modulePath.join(' → ')}]`);
  }

  isRunning(): boolean {
    return this.running;
  }

  getElapsed(): number {
    return Date.now() - this.startTime;
  }
}

// ============================================================================
// Progress Bar
// ============================================================================

export interface ProgressBarOptions {
  width?: number;
  complete?: string;
  incomplete?: string;
  showPercent?: boolean;
  showCount?: boolean;
}

export class ProgressBar {
  private total: number;
  private current = 0;
  private width: number;
  private completeChar: string;
  private incompleteChar: string;
  private showPercent: boolean;
  private showCount: boolean;
  private label: string;

  constructor(total: number, label: string = '', options: ProgressBarOptions = {}) {
    this.total = total;
    this.label = label;
    this.width = options.width ?? 30;
    this.completeChar = options.complete ?? '█';
    this.incompleteChar = options.incomplete ?? '░';
    this.showPercent = options.showPercent ?? true;
    this.showCount = options.showCount ?? true;
  }

  update(current: number, label?: string): void {
    this.current = Math.min(current, this.total);
    if (label) this.label = label;
    this.render();
  }

  increment(label?: string): void {
    this.update(this.current + 1, label);
  }

  private render(): void {
    const percent = this.total > 0 ? this.current / this.total : 0;
    const filled = Math.round(this.width * percent);
    const empty = this.width - filled;

    const bar = style(this.completeChar.repeat(filled), 'green') +
                style(this.incompleteChar.repeat(empty), 'dim');

    let suffix = '';
    if (this.showPercent) {
      suffix += ` ${(percent * 100).toFixed(0)}%`;
    }
    if (this.showCount) {
      suffix += ` (${this.current}/${this.total})`;
    }

    const prefix = this.label ? `${this.label} ` : '';

    process.stdout.write(`\r${prefix}${bar}${muted(suffix)}${' '.repeat(10)}`);
  }

  complete(): void {
    this.current = this.total;
    this.render();
    console.log(); // New line
  }
}

// ============================================================================
// Code Highlighting
// ============================================================================

/**
 * Highlight code blocks in markdown-style text
 */
export function highlightCode(text: string): string {
  // Highlight fenced code blocks
  return text.replace(
    /```(\w+)?\n([\s\S]*?)```/g,
    (_, lang, code) => {
      const langLabel = lang ? style(`[${lang}]`, 'dim') + '\n' : '';
      return '\n' + langLabel + style(code.trim(), 'cyan') + '\n';
    }
  );
}

/**
 * Highlight inline code
 */
export function highlightInlineCode(text: string): string {
  return text.replace(
    /`([^`]+)`/g,
    (_, code) => style(code, 'cyan')
  );
}

/**
 * Filter out LLM meta-comments (self-referential explanations)
 * These are internal reasoning artifacts that shouldn't be shown to users
 */
export function filterMetaComments(text: string): string {
  let result = text;

  // Remove "This response follows my principles" type blocks
  result = result.replace(/This response follows my principles[^]*?(?=\n\n|\n[A-Z]|$)/gi, '');

  // Remove "<reasoning>" and "</reasoning>" type explanations
  result = result.replace(/<reasoning>[\s\S]*?<\/reasoning>/gi, '');

  // Remove "Based on my analysis" self-commentary
  result = result.replace(/\n\nBased on (?:my|this) analysis[^]*?(?=\n\n[A-Z]|$)/gi, '');

  // Remove numbered lists explaining response strategy
  result = result.replace(/\n\nThe assistant (?:did|used|chose)[^]*?(?=\n\n[A-Z]|$)/gi, '');

  // Clean up excess whitespace
  result = result.replace(/\n{3,}/g, '\n\n').trim();

  return result;
}

/**
 * Full markdown-style formatting
 */
export function formatMarkdown(text: string): string {
  // First filter out meta-comments
  let result = filterMetaComments(text);

  // Code blocks first
  result = highlightCode(result);

  // Inline code
  result = highlightInlineCode(result);

  // Bold
  result = result.replace(/\*\*([^*]+)\*\*/g, (_, t) => style(t, 'bold'));

  // Italic
  result = result.replace(/\*([^*]+)\*/g, (_, t) => style(t, 'italic'));

  // Headers
  result = result.replace(/^### (.+)$/gm, (_, t) => style(t, 'bold', 'yellow'));
  result = result.replace(/^## (.+)$/gm, (_, t) => style(t, 'bold', 'cyan'));
  result = result.replace(/^# (.+)$/gm, (_, t) => style(t, 'bold', 'green'));

  // Links (just highlight, can't click in terminal)
  result = result.replace(/\[([^\]]+)\]\([^)]+\)/g, (_, t) => style(t, 'underline', 'blue'));

  return result;
}

// ============================================================================
// Box Drawing
// ============================================================================

export interface BoxOptions {
  padding?: number;
  borderColor?: ColorName;
  titleColor?: ColorName;
  title?: string;
}

export function box(content: string | string[], options: BoxOptions = {}): string {
  const lines = Array.isArray(content) ? content : content.split('\n');
  const padding = options.padding ?? 1;
  const borderColor = options.borderColor ?? 'cyan';
  const titleColor = options.titleColor ?? 'bold';

  // Calculate width
  const maxLineLength = Math.max(...lines.map(l => stripAnsi(l).length));
  const innerWidth = maxLineLength + padding * 2;

  const horizontal = '═'.repeat(innerWidth);
  const topBorder = style('╔' + horizontal + '╗', borderColor);
  const bottomBorder = style('╚' + horizontal + '╝', borderColor);

  const result: string[] = [];

  // Top border with optional title
  if (options.title) {
    const titleStr = ` ${options.title} `;
    const titleLen = stripAnsi(titleStr).length;
    const leftPad = Math.floor((innerWidth - titleLen) / 2);
    const rightPad = innerWidth - titleLen - leftPad;
    result.push(
      style('╔' + '═'.repeat(leftPad), borderColor) +
      style(titleStr, titleColor) +
      style('═'.repeat(rightPad) + '╗', borderColor)
    );
  } else {
    result.push(topBorder);
  }

  // Content lines
  for (const line of lines) {
    const lineLen = stripAnsi(line).length;
    const rightPad = innerWidth - lineLen - padding;
    result.push(
      style('║', borderColor) +
      ' '.repeat(padding) +
      line +
      ' '.repeat(Math.max(0, rightPad)) +
      style('║', borderColor)
    );
  }

  result.push(bottomBorder);

  return result.join('\n');
}

// ============================================================================
// Table
// ============================================================================

export interface TableColumn {
  header: string;
  key: string;
  width?: number;
  align?: 'left' | 'center' | 'right';
}

export function table(data: Record<string, any>[], columns: TableColumn[]): string {
  // Calculate column widths
  const widths = columns.map(col => {
    if (col.width) return col.width;
    const headerLen = col.header.length;
    const maxDataLen = Math.max(...data.map(row => String(row[col.key] ?? '').length));
    return Math.max(headerLen, maxDataLen);
  });

  const separator = '─'.repeat(widths.reduce((a, b) => a + b + 3, 1));

  const lines: string[] = [];

  // Header
  const headerRow = columns.map((col, i) => pad(col.header, widths[i], col.align)).join(' │ ');
  lines.push(style('┌' + separator + '┐', 'dim'));
  lines.push(style('│ ', 'dim') + style(headerRow, 'bold') + style(' │', 'dim'));
  lines.push(style('├' + separator + '┤', 'dim'));

  // Data rows
  for (const row of data) {
    const rowStr = columns.map((col, i) => {
      const value = String(row[col.key] ?? '');
      return pad(value, widths[i], col.align);
    }).join(' │ ');
    lines.push(style('│ ', 'dim') + rowStr + style(' │', 'dim'));
  }

  lines.push(style('└' + separator + '┘', 'dim'));

  return lines.join('\n');
}

// ============================================================================
// Utilities
// ============================================================================

/**
 * Strip ANSI codes from string
 */
export function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/g, '');
}

/**
 * Pad string to width
 */
export function pad(text: string, width: number, align: 'left' | 'center' | 'right' = 'left'): string {
  const len = stripAnsi(text).length;
  if (len >= width) return text;

  const padding = width - len;

  switch (align) {
    case 'right':
      return ' '.repeat(padding) + text;
    case 'center':
      const left = Math.floor(padding / 2);
      const right = padding - left;
      return ' '.repeat(left) + text + ' '.repeat(right);
    default:
      return text + ' '.repeat(padding);
  }
}

/**
 * Truncate text with ellipsis
 */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + '...';
}

/**
 * Format duration in human readable format
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.round((ms % 60000) / 1000);
  return `${minutes}m ${seconds}s`;
}

/**
 * Format bytes in human readable format
 */
export function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  while (bytes >= 1024 && i < units.length - 1) {
    bytes /= 1024;
    i++;
  }
  return `${bytes.toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

// ============================================================================
// Input History (for readline enhancement)
// ============================================================================

export class InputHistory {
  private history: string[] = [];
  private maxSize: number;
  private position = -1;

  constructor(maxSize: number = 100) {
    this.maxSize = maxSize;
  }

  add(input: string): void {
    // Don't add duplicates of the last entry
    if (input && input !== this.history[0]) {
      this.history.unshift(input);
      if (this.history.length > this.maxSize) {
        this.history.pop();
      }
    }
    this.position = -1;
  }

  previous(current: string): string | null {
    if (this.position < this.history.length - 1) {
      this.position++;
      return this.history[this.position];
    }
    return null;
  }

  next(): string | null {
    if (this.position > 0) {
      this.position--;
      return this.history[this.position];
    }
    if (this.position === 0) {
      this.position = -1;
      return '';
    }
    return null;
  }

  reset(): void {
    this.position = -1;
  }

  getAll(): string[] {
    return [...this.history];
  }

  clear(): void {
    this.history = [];
    this.position = -1;
  }
}

// ============================================================================
// Banner
// ============================================================================

export function banner(title: string, subtitle?: string, width: number = 63): void {
  console.log();
  console.log(style('╔' + '═'.repeat(width) + '╗', 'cyan'));

  const titlePadding = width - title.length;
  console.log(
    style('║', 'cyan') +
    '  ' + style(title, 'bold') +
    ' '.repeat(titlePadding - 2) +
    style('║', 'cyan')
  );

  if (subtitle) {
    const subPadding = width - subtitle.length;
    console.log(
      style('║', 'cyan') +
      '  ' + style(subtitle, 'dim') +
      ' '.repeat(subPadding - 2) +
      style('║', 'cyan')
    );
  }

  console.log(style('╚' + '═'.repeat(width) + '╝', 'cyan'));
  console.log();
}

// ============================================================================
// Status Line (v7.6 - Claude Code style)
// ============================================================================

export interface StatusLineConfig {
  model?: string;
  phi?: number;
  tokens?: number;
  sessionId?: string;
  mcpServers?: number;
  mcpStatus?: 'connected' | 'partial' | 'disconnected';
  brainActive?: boolean;
  toolsEnabled?: boolean;
  // v7.20.1: Cost tracking like Claude Code
  cost?: number;          // USD cost
  tokenRate?: number;     // tokens/sec
  inputTokens?: number;   // Input tokens
  outputTokens?: number;  // Output tokens
}

/**
 * v7.20.1: Compact inline status (Claude Code style)
 * Format: "φ:0.72 │ 89 tokens (→48 tok/s) │ $0.002 │ MCP ✓"
 */
export function formatCompactStatus(config: StatusLineConfig): string {
  const parts: string[] = [];

  // φ level with mini bar
  if (config.phi !== undefined) {
    const phiColor = config.phi > 0.5 ? 'green' : config.phi > 0.3 ? 'yellow' : 'dim';
    parts.push(style(`φ:${config.phi.toFixed(2)}`, phiColor));
  }

  // Tokens with rate
  if (config.tokens !== undefined) {
    let tokenStr = `${config.tokens} tok`;
    if (config.tokenRate && config.tokenRate > 0) {
      tokenStr += style(` (→${Math.round(config.tokenRate)} tok/s)`, 'dim');
    }
    parts.push(tokenStr);
  }

  // Cost
  if (config.cost !== undefined && config.cost > 0) {
    const costStr = config.cost < 0.01
      ? `$${(config.cost * 1000).toFixed(2)}m`  // millicents for tiny costs
      : `$${config.cost.toFixed(3)}`;
    parts.push(style(costStr, 'yellow'));
  }

  // MCP status
  if (config.mcpStatus) {
    const mcpIcon = config.mcpStatus === 'connected' ? style('✓', 'green')
                  : config.mcpStatus === 'partial' ? style('◐', 'yellow')
                  : style('✗', 'red');
    parts.push(`MCP ${mcpIcon}`);
  }

  return parts.join(style(' │ ', 'dim'));
}

/**
 * Real-time status line at bottom of terminal
 * Displays: model │ φ │ tokens │ session │ MCP status
 */
export class StatusLine {
  private config: StatusLineConfig = {};
  private enabled: boolean = true;
  private lastLine: string = '';
  private updateInterval: NodeJS.Timeout | null = null;

  constructor(initialConfig?: StatusLineConfig) {
    if (initialConfig) {
      this.config = { ...initialConfig };
    }
  }

  update(config: Partial<StatusLineConfig>): void {
    this.config = { ...this.config, ...config };
    if (this.enabled) {
      this.render();
    }
  }

  private render(): void {
    const parts: string[] = [];

    // Model name (shortened)
    if (this.config.model) {
      const shortModel = this.config.model
        .replace('claude-', '')
        .replace('-20250514', '')
        .replace('sonnet-4', 'sonnet4')
        .replace('opus-4', 'opus4');
      parts.push(style(shortModel, 'cyan'));
    }

    // Phi (consciousness level)
    if (this.config.phi !== undefined) {
      const phiColor = this.config.phi > 0.5 ? 'green' : this.config.phi > 0.3 ? 'yellow' : 'red';
      parts.push(style(`φ:${this.config.phi.toFixed(2)}`, phiColor));
    }

    // Token count
    if (this.config.tokens !== undefined) {
      const tokenStr = this.config.tokens > 1000
        ? `${(this.config.tokens / 1000).toFixed(1)}k`
        : String(this.config.tokens);
      parts.push(style(`${tokenStr} tok`, 'dim'));
    }

    // Session ID (first 8 chars)
    if (this.config.sessionId) {
      parts.push(style(this.config.sessionId.slice(0, 8), 'dim'));
    }

    // MCP status
    if (this.config.mcpServers !== undefined) {
      const mcpIcon = this.config.mcpStatus === 'connected' ? '✓' :
                      this.config.mcpStatus === 'partial' ? '◐' : '✗';
      const mcpColor = this.config.mcpStatus === 'connected' ? 'green' :
                       this.config.mcpStatus === 'partial' ? 'yellow' : 'red';
      parts.push(style(`${this.config.mcpServers} MCP ${mcpIcon}`, mcpColor));
    }

    // Brain status
    if (this.config.brainActive) {
      parts.push(style('🧠', 'magenta'));
    }

    // Build the line
    const separator = style(' │ ', 'dim');
    const line = parts.join(separator);

    // Get terminal width
    const termWidth = process.stdout.columns || 80;
    const paddedLine = '─'.repeat(termWidth);

    // Only update if changed
    if (line !== this.lastLine) {
      this.lastLine = line;
      // Save cursor, move to bottom, print, restore cursor
      process.stdout.write(`\x1b7\x1b[${process.stdout.rows};0H\x1b[K${style(paddedLine, 'dim')}\r ${line}\x1b8`);
    }
  }

  show(): void {
    this.enabled = true;
    this.render();
  }

  hide(): void {
    this.enabled = false;
    // Clear the status line
    process.stdout.write(`\x1b7\x1b[${process.stdout.rows};0H\x1b[K\x1b8`);
  }

  startAutoUpdate(intervalMs: number = 1000): void {
    if (this.updateInterval) return;
    this.updateInterval = setInterval(() => this.render(), intervalMs);
  }

  stopAutoUpdate(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
  }

  getConfig(): StatusLineConfig {
    return { ...this.config };
  }
}

// Singleton instance
let _statusLine: StatusLine | null = null;

export function getStatusLine(): StatusLine {
  if (!_statusLine) {
    _statusLine = new StatusLine();
  }
  return _statusLine;
}

// ============================================================================
// Rich Prompt (v7.6 - Context-aware prompt)
// ============================================================================

export interface PromptContext {
  model?: string;
  phi?: number;
  sessionName?: string;
  thinking?: boolean;
  toolsActive?: boolean;
}

/**
 * Build a context-aware prompt string
 * v7.20.2: Minimal elegant style like Claude Code
 * Format: > (simple) or genesis> (with context)
 */
export function buildRichPrompt(context: PromptContext = {}, minimal: boolean = true): string {
  if (minimal) {
    // Claude Code style: just a simple chevron
    return style('> ', 'cyan', 'bold');
  }

  // Rich mode: show context
  const parts: string[] = [];
  parts.push(style('genesis', 'cyan'));

  // Model indicator (very short)
  if (context.model) {
    const shortModel = context.model
      .replace('claude-', '')
      .replace('-20250514', '')
      .replace('sonnet-4', 's4')
      .replace('opus-4', 'o4')
      .replace('haiku', 'h')
      .replace('gpt-4o-mini', '4om')
      .replace('gpt-4o', '4o')
      .replace('qwen2.5-coder', 'qw');
    parts.push(style(shortModel, 'dim'));
  }

  // Phi only if meaningful
  if (context.phi !== undefined && context.phi > 0.1) {
    const phiColor = context.phi > 0.5 ? 'green' : context.phi > 0.3 ? 'yellow' : 'dim';
    parts.push(style(`φ${context.phi.toFixed(1)}`, phiColor));
  }

  return parts.join(style('·', 'dim')) + style('> ', 'cyan');
}

/**
 * v7.20.2: Print elegant separator line
 */
export function printSeparator(char: string = '─', width: number = 60): void {
  console.log(style(char.repeat(width), 'dim'));
}

/**
 * v7.20.2: Print clean section header
 */
export function printHeader(text: string): void {
  console.log();
  console.log(style(text, 'bold'));
  console.log(style('─'.repeat(text.length + 4), 'dim'));
}

// ============================================================================
// Compact Tool UI (v7.6 - Minimal tool execution display)
// ============================================================================

export interface ToolExecutionDisplay {
  name: string;
  params?: Record<string, unknown>;
  status: 'pending' | 'running' | 'success' | 'error';
  duration?: number;
  result?: string;
}

/**
 * Format tool execution in compact single-line format
 * Format: ⚡ tool_name(params...) ... ✓ result (420ms)
 */
export function formatToolExecution(exec: ToolExecutionDisplay): string {
  const icon = exec.status === 'running' ? style('⟳', 'yellow') :
               exec.status === 'success' ? style('✓', 'green') :
               exec.status === 'error' ? style('✗', 'red') :
               style('○', 'dim');

  // Format params (truncated)
  let paramsStr = '';
  if (exec.params && Object.keys(exec.params).length > 0) {
    const paramParts: string[] = [];
    for (const [key, value] of Object.entries(exec.params)) {
      const valStr = typeof value === 'string' ? `"${truncate(value, 30)}"` :
                     JSON.stringify(value).slice(0, 30);
      paramParts.push(valStr);
    }
    paramsStr = `(${paramParts.join(', ')})`;
  }

  // Duration
  const durationStr = exec.duration !== undefined
    ? style(` (${exec.duration}ms)`, 'dim')
    : '';

  // Result summary
  const resultStr = exec.result
    ? ` ${style(truncate(exec.result, 40), 'dim')}`
    : '';

  return `${style('⚡', 'cyan')} ${style(exec.name, 'bold')}${style(paramsStr, 'dim')} ${icon}${resultStr}${durationStr}`;
}

/**
 * Compact tool permission prompt
 * Format: Allow tool_name? [Y/n/always]
 */
export function formatToolPermission(toolName: string, params?: Record<string, unknown>): string {
  const paramHint = params && Object.keys(params).length > 0
    ? style(` with ${Object.keys(params).join(', ')}`, 'dim')
    : '';

  return `${style('?', 'yellow')} Allow ${style(toolName, 'cyan', 'bold')}${paramHint}? ${style('[Y/n/always]', 'dim')} `;
}

// ============================================================================
// Streaming Output (v7.6 - Token-by-token rendering)
// ============================================================================

/**
 * Stream text token by token with optional syntax highlighting
 */
export class StreamingOutput {
  private buffer: string = '';
  private inCodeBlock: boolean = false;
  private codeLanguage: string = '';
  private lineBuffer: string = '';

  /**
   * Write a token to output with streaming effect
   */
  write(token: string): void {
    this.buffer += token;
    this.lineBuffer += token;

    // Check for code block start/end
    if (this.lineBuffer.includes('```')) {
      const match = this.lineBuffer.match(/```(\w+)?/);
      if (match && !this.inCodeBlock) {
        this.inCodeBlock = true;
        this.codeLanguage = match[1] || '';
        // Print code block header
        process.stdout.write(style(`\n[${this.codeLanguage || 'code'}]\n`, 'dim'));
        this.lineBuffer = this.lineBuffer.replace(/```\w*/, '');
      } else if (this.inCodeBlock) {
        this.inCodeBlock = false;
        this.codeLanguage = '';
        this.lineBuffer = this.lineBuffer.replace(/```/, '');
        process.stdout.write('\n');
      }
    }

    // Write token with appropriate styling
    if (this.inCodeBlock) {
      process.stdout.write(style(token, 'cyan'));
    } else {
      // Apply inline code highlighting
      const formatted = token.replace(/`([^`]+)`/g, (_, code) => style(code, 'cyan'));
      process.stdout.write(formatted);
    }
  }

  /**
   * Write a complete line (for non-streaming fallback)
   */
  writeLine(line: string): void {
    console.log(formatMarkdown(line));
  }

  /**
   * Flush buffer and reset
   */
  flush(): void {
    this.buffer = '';
    this.lineBuffer = '';
    this.inCodeBlock = false;
    this.codeLanguage = '';
    console.log(); // Ensure newline at end
  }

  /**
   * Get full buffered content
   */
  getBuffer(): string {
    return this.buffer;
  }
}

// ============================================================================
// Tool Execution Summary (v7.6)
// ============================================================================

export interface ToolSummary {
  total: number;
  successful: number;
  failed: number;
  totalDuration: number;
}

/**
 * Format a summary of tool executions
 */
export function formatToolSummary(summary: ToolSummary): string {
  const successRate = summary.total > 0
    ? Math.round((summary.successful / summary.total) * 100)
    : 0;

  const parts = [
    style(`${summary.total} tools`, 'bold'),
    style(`${summary.successful}✓`, 'green'),
  ];

  if (summary.failed > 0) {
    parts.push(style(`${summary.failed}✗`, 'red'));
  }

  parts.push(style(`${summary.totalDuration}ms`, 'dim'));

  return parts.join(' ');
}

// ============================================================================
// Extended Thinking Visualization (v7.4.4)
// ============================================================================

/**
 * Parsed thinking block from LLM response
 */
export interface ThinkingBlock {
  content: string;
  startIndex: number;
  endIndex: number;
  type: 'think' | 'thinking' | 'reasoning';
}

/**
 * Result of parsing a response for thinking blocks
 */
export interface ParsedResponse {
  thinking: ThinkingBlock[];
  content: string;  // Response with thinking blocks removed
  hasThinking: boolean;
}

/**
 * Parse thinking blocks from LLM response
 * Supports: <think>...</think>, <thinking>...</thinking>, <reasoning>...</reasoning>
 */
export function parseThinkingBlocks(response: string): ParsedResponse {
  const thinking: ThinkingBlock[] = [];
  let content = response;

  // Patterns for different thinking block formats
  const patterns = [
    { regex: /<think>([\s\S]*?)<\/think>/gi, type: 'think' as const },
    { regex: /<thinking>([\s\S]*?)<\/thinking>/gi, type: 'thinking' as const },
    { regex: /<reasoning>([\s\S]*?)<\/reasoning>/gi, type: 'reasoning' as const },
  ];

  for (const { regex, type } of patterns) {
    let match;
    while ((match = regex.exec(response)) !== null) {
      thinking.push({
        content: match[1].trim(),
        startIndex: match.index,
        endIndex: match.index + match[0].length,
        type,
      });
    }
    // Remove thinking blocks from content
    content = content.replace(regex, '');
  }

  // Clean up extra whitespace from removal
  content = content.replace(/\n{3,}/g, '\n\n').trim();

  return {
    thinking,
    content,
    hasThinking: thinking.length > 0,
  };
}

/**
 * Format a thinking block for display
 * @param block - The thinking block to format
 * @param collapsed - Whether to show collapsed (summary only) or expanded
 * @param maxPreviewLength - Max characters for collapsed preview
 */
export function formatThinkingBlock(
  block: ThinkingBlock,
  collapsed: boolean = false,
  maxPreviewLength: number = 80
): string {
  const lines: string[] = [];
  const icon = '💭';
  const label = block.type === 'reasoning' ? 'Reasoning' : 'Thinking';

  if (collapsed) {
    // Collapsed: show one-line preview
    const preview = block.content
      .replace(/\n/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const truncated = preview.length > maxPreviewLength
      ? preview.slice(0, maxPreviewLength - 3) + '...'
      : preview;
    lines.push(style(`  ${icon} [${label}] ${truncated}`, 'dim'));
  } else {
    // Expanded: show full thinking with visual distinction
    lines.push(style(`  ${icon} ─── ${label} ───`, 'dim'));

    // Indent and dim each line of thinking content
    const thinkingLines = block.content.split('\n');
    for (const line of thinkingLines) {
      lines.push(style(`  │ ${line}`, 'dim'));
    }

    lines.push(style('  └───────────────', 'dim'));
  }

  return lines.join('\n');
}

/**
 * Format response with thinking blocks
 * @param response - Raw LLM response
 * @param showThinking - Whether to show thinking blocks
 * @param collapsedThinking - Whether thinking should be collapsed
 */
export function formatResponseWithThinking(
  response: string,
  showThinking: boolean = true,
  collapsedThinking: boolean = false
): { formatted: string; hasThinking: boolean; thinkingCount: number } {
  const parsed = parseThinkingBlocks(response);

  if (!parsed.hasThinking) {
    return {
      formatted: formatMarkdown(parsed.content),
      hasThinking: false,
      thinkingCount: 0,
    };
  }

  const parts: string[] = [];

  // Show thinking blocks first if enabled
  if (showThinking && parsed.thinking.length > 0) {
    for (const block of parsed.thinking) {
      parts.push(formatThinkingBlock(block, collapsedThinking));
    }
    parts.push(''); // Empty line between thinking and response
  } else if (parsed.thinking.length > 0) {
    // Just show indicator that thinking was hidden
    parts.push(style(`  💭 [${parsed.thinking.length} thinking block(s) hidden - use /thinking to show]`, 'dim'));
    parts.push('');
  }

  // Add the main response content
  parts.push(formatMarkdown(parsed.content));

  return {
    formatted: parts.join('\n'),
    hasThinking: true,
    thinkingCount: parsed.thinking.length,
  };
}

/**
 * Thinking visualization settings
 */
export interface ThinkingSettings {
  enabled: boolean;      // Show thinking blocks at all
  collapsed: boolean;    // Collapsed (one-line) vs expanded view
  streaming: boolean;    // Show thinking as it streams (future)
}

export const DEFAULT_THINKING_SETTINGS: ThinkingSettings = {
  enabled: false,  // v7.24: Hidden by default - use /thinking to show
  collapsed: true,  // v7.20.1: Collapsed by default like Claude Code
  streaming: false,
};

// ============================================================================
// v7.6: Extended Thinking Result Display
// ============================================================================

/**
 * Extended thinking step for display
 */
export interface ExtendedThinkingStep {
  type: 'deliberation' | 'reasoning' | 'critique' | 'revision' | 'uncertainty';
  content: string;
  tokens: number;
  confidence?: number;
}

/**
 * Extended thinking result summary
 */
export interface ExtendedThinkingDisplay {
  steps: ExtendedThinkingStep[];
  totalTokens: number;
  finalConfidence: number;
  uncertainties: string[];
  principlesApplied: string[];
  iterations: number;
  duration: number;
}

/**
 * Format a single extended thinking step
 */
export function formatExtendedThinkingStep(step: ExtendedThinkingStep): string {
  const icons: Record<string, string> = {
    deliberation: '⚖️',
    reasoning: '🧠',
    critique: '🔍',
    revision: '✏️',
    uncertainty: '❓',
  };

  const colors: Record<string, ColorName> = {
    deliberation: 'magenta',
    reasoning: 'cyan',
    critique: 'yellow',
    revision: 'green',
    uncertainty: 'red',
  };

  const icon = icons[step.type] || '•';
  const color = colors[step.type] || 'white';
  const label = step.type.charAt(0).toUpperCase() + step.type.slice(1);

  const lines: string[] = [];
  lines.push(`${icon} ${style(label, color, 'bold')}${step.confidence !== undefined ? style(` (${(step.confidence * 100).toFixed(0)}% confident)`, 'dim') : ''}`);

  // Indent content
  const contentLines = step.content.split('\n').map(l => `   ${l}`);
  lines.push(...contentLines);

  lines.push(style(`   [${step.tokens} tokens]`, 'dim'));

  return lines.join('\n');
}

/**
 * Format extended thinking summary bar
 */
export function formatExtendedThinkingSummary(display: ExtendedThinkingDisplay): string {
  const confColor: ColorName = display.finalConfidence >= 0.8 ? 'green' :
                               display.finalConfidence >= 0.5 ? 'yellow' : 'red';

  const parts = [
    style('🧠 Extended Thinking:', 'bold'),
    style(`${display.iterations} iter`, 'cyan'),
    style(`${display.totalTokens} tokens`, 'dim'),
    style(`${(display.finalConfidence * 100).toFixed(0)}%`, confColor),
    style(formatDuration(display.duration), 'dim'),
  ];

  return parts.join(' • ');
}

/**
 * Format full extended thinking visualization
 */
export function formatExtendedThinking(
  display: ExtendedThinkingDisplay,
  showSteps: boolean = true,
  maxSteps: number = 10
): string {
  const lines: string[] = [];

  // Header with summary
  lines.push(box(formatExtendedThinkingSummary(display), { borderColor: 'dim' }));
  lines.push('');

  // Principles applied (if any)
  if (display.principlesApplied.length > 0) {
    lines.push(style('⚖️ Principles Applied:', 'magenta', 'bold'));
    for (const principle of display.principlesApplied.slice(0, 5)) {
      lines.push(style(`   • ${principle}`, 'dim'));
    }
    lines.push('');
  }

  // Steps (if showing)
  if (showSteps && display.steps.length > 0) {
    const stepsToShow = display.steps.slice(0, maxSteps);
    lines.push(style('📝 Thinking Steps:', 'cyan', 'bold'));
    lines.push('');

    for (let i = 0; i < stepsToShow.length; i++) {
      const step = stepsToShow[i];
      lines.push(style(`Step ${i + 1}/${display.steps.length}`, 'dim'));
      lines.push(formatExtendedThinkingStep(step));
      lines.push('');
    }

    if (display.steps.length > maxSteps) {
      lines.push(style(`   ... and ${display.steps.length - maxSteps} more steps`, 'dim'));
      lines.push('');
    }
  }

  // Uncertainties (if any)
  if (display.uncertainties.length > 0) {
    lines.push(style('❓ Uncertainties:', 'yellow', 'bold'));
    for (const uncertainty of display.uncertainties.slice(0, 3)) {
      lines.push(style(`   • ${uncertainty}`, 'yellow'));
    }
    if (display.uncertainties.length > 3) {
      lines.push(style(`   ... and ${display.uncertainties.length - 3} more`, 'dim'));
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Format compact thinking status (for inline display)
 */
export function formatThinkingStatus(
  type: 'deliberating' | 'reasoning' | 'critiquing' | 'revising' | 'selecting',
  progress?: { current: number; total: number }
): string {
  const icons: Record<string, string> = {
    deliberating: '⚖️',
    reasoning: '🧠',
    critiquing: '🔍',
    revising: '✏️',
    selecting: '🎯',
  };

  const labels: Record<string, string> = {
    deliberating: 'Applying principles',
    reasoning: 'Extended thinking',
    critiquing: 'Self-critique',
    revising: 'Revising response',
    selecting: 'Best-of-N selection',
  };

  const icon = icons[type] || '•';
  const label = labels[type] || type;
  const progressStr = progress ? style(` [${progress.current}/${progress.total}]`, 'dim') : '';

  return `${icon} ${style(label, 'cyan')}${progressStr}`;
}

// ============================================================================
// v7.20: Genesis Banner
// ============================================================================

export const GENESIS_LOGO = `
${style('   ██████╗ ███████╗███╗   ██╗███████╗███████╗██╗███████╗', 'cyan')}
${style('  ██╔════╝ ██╔════╝████╗  ██║██╔════╝██╔════╝██║██╔════╝', 'cyan')}
${style('  ██║  ███╗█████╗  ██╔██╗ ██║█████╗  ███████╗██║███████╗', 'cyan', 'bold')}
${style('  ██║   ██║██╔══╝  ██║╚██╗██║██╔══╝  ╚════██║██║╚════██║', 'cyan')}
${style('  ╚██████╔╝███████╗██║ ╚████║███████╗███████║██║███████║', 'cyan')}
${style('   ╚═════╝ ╚══════╝╚═╝  ╚═══╝╚══════╝╚══════╝╚═╝╚══════╝', 'cyan', 'dim')}
`;

export interface BannerOptions {
  version: string;
  compact?: boolean;
  model?: string;
  mcpServers?: number;
  devMode?: boolean;
}

export function showBanner(versionOrOptions: string | BannerOptions, compact: boolean = true): void {
  // Support both old and new API
  const opts: BannerOptions = typeof versionOrOptions === 'string'
    ? { version: versionOrOptions, compact }
    : versionOrOptions;

  if (opts.compact !== false) {
    // Clean one-liner like Claude Code
    const parts = [
      style('genesis', 'cyan', 'bold'),
      style(` v${opts.version}`, 'dim'),
    ];

    // Show model if provided
    if (opts.model) {
      parts.push(style(' · ', 'dim'));
      parts.push(style(opts.model, 'yellow'));
    }

    // Show MCP count if provided
    if (opts.mcpServers !== undefined) {
      parts.push(style(' · ', 'dim'));
      parts.push(style(`${opts.mcpServers} MCP`, 'green'));
    }

    console.log(parts.join(''));
    console.log();
  } else {
    // Full ASCII art banner (use with --fancy flag)
    console.log(GENESIS_LOGO);
    console.log(style(`  v${opts.version}`, 'cyan', 'bold') + style(' • Self-Aware AI • Active Inference • φ Monitoring', 'dim'));
    console.log(style('  ──────────────────────────────────────────────────────────', 'dim'));
    console.log();
  }
}

// ============================================================================
// v7.20: Interactive Menu System
// ============================================================================

export interface MenuItem {
  key: string;
  label: string;
  description?: string;
  icon?: string;
  shortcut?: string;
}

export function formatMenu(items: MenuItem[], title?: string): string {
  const lines: string[] = [];

  if (title) {
    lines.push(style(title, 'bold', 'cyan'));
    lines.push(style('─'.repeat(50), 'dim'));
    lines.push('');
  }

  for (const item of items) {
    const icon = item.icon || '•';
    const key = style(`/${item.key}`, 'yellow', 'bold');
    const shortcut = item.shortcut ? style(` (${item.shortcut})`, 'dim') : '';
    const desc = item.description ? style(` - ${item.description}`, 'dim') : '';

    lines.push(`  ${icon} ${key}${shortcut}${desc}`);
  }

  return lines.join('\n');
}

export const MAIN_MENU: MenuItem[] = [
  { key: 'help', label: 'Help', icon: '❓', description: 'Show all commands' },
  { key: 'improve', label: 'Self-Improve', icon: '🧬', description: 'Analyze and improve Genesis code' },
  { key: 'daemon', label: 'Daemon', icon: '👹', description: 'Background autonomous mode' },
  { key: 'watch', label: 'Watch', icon: '👁', description: 'Real-time code monitoring' },
  { key: 'agents', label: 'Agents', icon: '🤖', description: 'View active agents' },
  { key: 'memory', label: 'Memory', icon: '🧠', description: 'Memory system stats' },
  { key: 'thinking', label: 'Thinking', icon: '💭', description: 'Toggle thinking display' },
  { key: 'status', label: 'Status', icon: '📊', description: 'System status' },
  { key: 'clear', label: 'Clear', icon: '🗑', description: 'Clear screen' },
  { key: 'exit', label: 'Exit', icon: '👋', description: 'Exit Genesis' },
];

export function showMainMenu(): void {
  console.log();
  console.log(formatMenu(MAIN_MENU, '🧬 Genesis Commands'));
  console.log();
}

// ============================================================================
// v7.20: Agent Call Visualization
// ============================================================================

export interface AgentCall {
  agent: string;
  action: string;
  params?: Record<string, unknown>;
  result?: unknown;
  duration?: number;
  children?: AgentCall[];
  status: 'pending' | 'running' | 'success' | 'error';
  startTime?: number;
}

export function formatAgentTree(calls: AgentCall[], indent: number = 0): string {
  const lines: string[] = [];
  const prefix = '  '.repeat(indent);

  for (let i = 0; i < calls.length; i++) {
    const call = calls[i];
    const isLast = i === calls.length - 1;
    const connector = isLast ? '└' : '├';
    const childConnector = isLast ? ' ' : '│';

    const statusIcon = {
      pending: style('○', 'dim'),
      running: style('◐', 'yellow'),
      success: style('●', 'green'),
      error: style('●', 'red'),
    }[call.status];

    const agentIcon = getAgentIcon(call.agent);
    const duration = call.duration ? style(` ${call.duration}ms`, 'dim') : '';
    const agentName = style(call.agent, 'magenta', 'bold');
    const actionName = style(call.action, 'cyan');

    lines.push(`${prefix}${style(connector + '─', 'dim')} ${statusIcon} ${agentIcon} ${agentName} → ${actionName}${duration}`);

    // Show params on running/pending
    if (call.status === 'running' && call.params) {
      const paramStr = formatParams(call.params);
      if (paramStr) {
        lines.push(`${prefix}${style(childConnector, 'dim')}     ${style(paramStr, 'dim')}`);
      }
    }

    // Show result preview on success/error
    if ((call.status === 'success' || call.status === 'error') && call.result) {
      const resultStr = formatResult(call.result, call.status);
      lines.push(`${prefix}${style(childConnector, 'dim')}     ${resultStr}`);
    }

    // Recursively show children
    if (call.children && call.children.length > 0) {
      lines.push(formatAgentTree(call.children, indent + 1));
    }
  }

  return lines.join('\n');
}

function getAgentIcon(agent: string | undefined): string {
  if (!agent) return '🤖';
  const icons: Record<string, string> = {
    COGNITION: '🧠',
    MEMORY: '📚',
    TOOLS: '🔧',
    RESEARCH: '🔬',
    CODE: '💻',
    CREATIVE: '🎨',
    CRITIC: '🔍',
    PLANNER: '📋',
    EXECUTOR: '⚡',
    HEALING: '🩹',
    default: '🤖',
  };
  return icons[agent.toUpperCase()] || icons.default;
}

function formatParams(params: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(params)) {
    const valueStr = typeof value === 'string'
      ? `"${truncate(value, 30)}"`
      : JSON.stringify(value).slice(0, 30);
    parts.push(`${key}=${valueStr}`);
  }
  return parts.slice(0, 3).join(', ') + (parts.length > 3 ? '...' : '');
}

function formatResult(result: unknown, status: 'success' | 'error'): string {
  const icon = status === 'success' ? style('↳', 'green') : style('↳', 'red');
  const resultStr = typeof result === 'string'
    ? truncate(result, 60)
    : JSON.stringify(result).slice(0, 60);
  const color = status === 'success' ? 'green' : 'red';
  return `${icon} ${style(resultStr, color)}`;
}

// ============================================================================
// v7.20: Real-Time Code Watcher Display
// ============================================================================

export interface CodeChange {
  file: string;
  type: 'add' | 'modify' | 'delete';
  lines?: { added: number; removed: number };
  preview?: string;
  timestamp: Date;
}

export function formatCodeChange(change: CodeChange): string {
  const icons = {
    add: style('+', 'green'),
    modify: style('~', 'yellow'),
    delete: style('-', 'red'),
  };

  const icon = icons[change.type];
  const time = style(`[${change.timestamp.toLocaleTimeString()}]`, 'dim');
  const file = style(change.file, 'cyan');
  const lines = change.lines
    ? style(` (+${change.lines.added}/-${change.lines.removed})`, 'dim')
    : '';

  let result = `${time} ${icon} ${file}${lines}`;

  if (change.preview) {
    result += '\n' + formatCodePreview(change.preview, change.type);
  }

  return result;
}

export function formatCodePreview(code: string, type: 'add' | 'modify' | 'delete'): string {
  const lines = code.split('\n').slice(0, 5);
  const prefix = type === 'add' ? '+' : type === 'delete' ? '-' : '~';
  const color: ColorName = type === 'add' ? 'green' : type === 'delete' ? 'red' : 'yellow';

  return lines
    .map(line => style(`    ${prefix} ${line}`, color))
    .join('\n');
}

// ============================================================================
// v7.20: Code Diff Display
// ============================================================================

export function formatDiff(filename: string, oldContent: string, newContent: string): string {
  const oldLines = oldContent.split('\n');
  const newLines = newContent.split('\n');

  const lines: string[] = [];
  lines.push(style(`─── ${filename} ───`, 'cyan', 'bold'));

  const maxLines = Math.max(oldLines.length, newLines.length);
  let changesShown = 0;

  for (let i = 0; i < maxLines && changesShown < 20; i++) {
    const oldLine = oldLines[i];
    const newLine = newLines[i];

    if (oldLine === newLine) continue;

    changesShown++;
    lines.push(style(`@@ line ${i + 1} @@`, 'magenta'));

    if (oldLine !== undefined && oldLine !== newLine) {
      lines.push(style(`- ${oldLine}`, 'red'));
    }
    if (newLine !== undefined && newLine !== oldLine) {
      lines.push(style(`+ ${newLine}`, 'green'));
    }
  }

  if (changesShown === 0) {
    lines.push(style('  No changes', 'dim'));
  } else if (changesShown >= 20) {
    lines.push(style('  ... more changes not shown', 'dim'));
  }

  return lines.join('\n');
}

// ============================================================================
// v7.20: System Status Display
// ============================================================================

export interface SystemStatus {
  phi?: number;
  memories?: number;
  agents?: number;
  mcpServers?: number;
  mcpStatus?: 'connected' | 'partial' | 'disconnected';
  uptime?: number;
  model?: string;
  version?: string;
  selfAware?: { files: number; modules: number };
}

export function formatSystemStatus(status: SystemStatus): string {
  const lines: string[] = [];

  lines.push(style('╭─────────────────────────────────────────────╮', 'cyan'));
  lines.push(style('│', 'cyan') + style(' 🧬 Genesis System Status', 'bold') + ' '.repeat(20) + style('│', 'cyan'));
  lines.push(style('├─────────────────────────────────────────────┤', 'cyan'));

  // Version & Model
  if (status.version || status.model) {
    const ver = status.version ? `v${status.version}` : '';
    const model = status.model ? status.model.replace('claude-', '') : '';
    lines.push(formatStatusLine('Version', `${ver} • ${model}`));
  }

  // Φ (Consciousness)
  if (status.phi !== undefined) {
    const phiBar = createMiniBar(status.phi, 10);
    const phiColor: ColorName = status.phi > 0.7 ? 'green' : status.phi > 0.4 ? 'yellow' : 'red';
    lines.push(formatStatusLine('φ', `${phiBar} ${style(status.phi.toFixed(2), phiColor)}`));
  }

  // Memory
  if (status.memories !== undefined) {
    lines.push(formatStatusLine('Memories', `${status.memories} stored`));
  }

  // Self-Awareness
  if (status.selfAware) {
    lines.push(formatStatusLine('Self-Aware', `${status.selfAware.files} files, ${status.selfAware.modules} modules`));
  }

  // Agents
  if (status.agents !== undefined) {
    lines.push(formatStatusLine('Agents', `${status.agents} active`));
  }

  // MCP
  if (status.mcpServers !== undefined) {
    const mcpIcon = status.mcpStatus === 'connected' ? '✓' :
                    status.mcpStatus === 'partial' ? '◐' : '✗';
    const mcpColor: ColorName = status.mcpStatus === 'connected' ? 'green' :
                                status.mcpStatus === 'partial' ? 'yellow' : 'red';
    lines.push(formatStatusLine('MCP', style(`${status.mcpServers} servers ${mcpIcon}`, mcpColor)));
  }

  // Uptime
  if (status.uptime !== undefined) {
    lines.push(formatStatusLine('Uptime', formatDuration(status.uptime)));
  }

  lines.push(style('╰─────────────────────────────────────────────╯', 'cyan'));

  return lines.join('\n');
}

function formatStatusLine(label: string, value: string): string {
  const paddedLabel = (label + ':').padEnd(12);
  return style('│', 'cyan') + ` ${style(paddedLabel, 'dim')}${value}`.padEnd(44) + style('│', 'cyan');
}

function createMiniBar(value: number, width: number): string {
  const filled = Math.round(value * width);
  const empty = width - filled;
  return style('█'.repeat(filled), 'cyan') + style('░'.repeat(empty), 'dim');
}

// ============================================================================
// v7.20: Self-Improvement Display
// ============================================================================

export interface ImprovementSuggestion {
  type: 'performance' | 'quality' | 'feature' | 'bug';
  priority: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  file?: string;
  line?: number;
}

export function formatImprovementSuggestion(suggestion: ImprovementSuggestion): string {
  const icons = {
    performance: '⚡',
    quality: '✨',
    feature: '🆕',
    bug: '🐛',
  };

  const priorityColors: Record<string, ColorName> = {
    high: 'red',
    medium: 'yellow',
    low: 'green',
  };

  const icon = icons[suggestion.type];
  const priority = style(`[${suggestion.priority.toUpperCase()}]`, priorityColors[suggestion.priority]);
  const title = style(suggestion.title, 'bold');
  const location = suggestion.file
    ? style(` (${suggestion.file}${suggestion.line ? `:${suggestion.line}` : ''})`, 'dim')
    : '';

  return `${icon} ${priority} ${title}${location}\n   ${style(suggestion.description, 'dim')}`;
}

export function formatImprovementReport(suggestions: ImprovementSuggestion[]): string {
  const lines: string[] = [];

  lines.push(style('╭─────────────────────────────────────────────╮', 'magenta'));
  lines.push(style('│', 'magenta') + style(' 🧬 Self-Improvement Analysis', 'bold') + ' '.repeat(14) + style('│', 'magenta'));
  lines.push(style('╰─────────────────────────────────────────────╯', 'magenta'));
  lines.push('');

  const grouped = {
    high: suggestions.filter(s => s.priority === 'high'),
    medium: suggestions.filter(s => s.priority === 'medium'),
    low: suggestions.filter(s => s.priority === 'low'),
  };

  for (const [priority, items] of Object.entries(grouped)) {
    if (items.length === 0) continue;

    lines.push(style(`${priority.toUpperCase()} PRIORITY (${items.length})`, priority === 'high' ? 'red' : priority === 'medium' ? 'yellow' : 'green', 'bold'));
    lines.push('');

    for (const item of items) {
      lines.push(formatImprovementSuggestion(item));
      lines.push('');
    }
  }

  return lines.join('\n');
}

// ============================================================================
// v7.20: Daemon Status Display
// ============================================================================

export interface DaemonStatus {
  active: boolean;
  tasks: { id: string; name: string; status: 'running' | 'queued' | 'completed' }[];
  uptime?: number;
  cyclesCompleted?: number;
  nextCycle?: number;
}

export function formatDaemonStatus(status: DaemonStatus): string {
  const lines: string[] = [];

  const statusIcon = status.active ? style('●', 'green') : style('○', 'dim');
  const statusText = status.active ? style('ACTIVE', 'green', 'bold') : style('INACTIVE', 'dim');

  lines.push(style('╭─────────────────────────────────────────────╮', 'yellow'));
  lines.push(style('│', 'yellow') + ` 👹 Daemon ${statusText}` + ' '.repeat(25 - statusText.length) + statusIcon + ' ' + style('│', 'yellow'));
  lines.push(style('├─────────────────────────────────────────────┤', 'yellow'));

  if (status.uptime) {
    lines.push(formatStatusLine('Uptime', formatDuration(status.uptime)).replace('cyan', 'yellow'));
  }

  if (status.cyclesCompleted !== undefined) {
    lines.push(formatStatusLine('Cycles', `${status.cyclesCompleted} completed`).replace('cyan', 'yellow'));
  }

  if (status.nextCycle !== undefined) {
    lines.push(formatStatusLine('Next', `in ${formatDuration(status.nextCycle)}`).replace('cyan', 'yellow'));
  }

  lines.push(style('├─────────────────────────────────────────────┤', 'yellow'));
  lines.push(style('│', 'yellow') + style(' Tasks:', 'bold') + ' '.repeat(37) + style('│', 'yellow'));

  for (const task of status.tasks.slice(0, 5)) {
    const taskIcon = task.status === 'running' ? style('◐', 'yellow') :
                     task.status === 'completed' ? style('✓', 'green') :
                     style('○', 'dim');
    const taskLine = `  ${taskIcon} ${truncate(task.name, 35)}`;
    lines.push(style('│', 'yellow') + taskLine.padEnd(44) + style('│', 'yellow'));
  }

  if (status.tasks.length > 5) {
    lines.push(style('│', 'yellow') + style(`  ... and ${status.tasks.length - 5} more`, 'dim').padEnd(44) + style('│', 'yellow'));
  }

  lines.push(style('╰─────────────────────────────────────────────╯', 'yellow'));

  return lines.join('\n');
}

// ============================================================================
// v7.20: Live Thinking Display (Real-time)
// ============================================================================

export class LiveThinkingDisplay {
  private steps: string[] = [];
  private startTime: number = 0;
  private currentStep: string = '';
  private interval: NodeJS.Timeout | null = null;

  start(): void {
    this.steps = [];
    this.startTime = Date.now();
    this.currentStep = 'Initializing';
    this.render();
  }

  addStep(step: string): void {
    if (this.currentStep) {
      this.steps.push(this.currentStep);
    }
    this.currentStep = step;
    this.render();
  }

  private render(): void {
    const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(1);

    // Clear previous render
    process.stdout.write('\r\x1b[K');

    // Show recent steps
    const recentSteps = this.steps.slice(-2);
    for (const step of recentSteps) {
      process.stdout.write(style(`  ✓ ${step}\n`, 'dim'));
    }

    // Show current step with spinner
    const frame = '⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏'[Math.floor(Date.now() / 80) % 10];
    process.stdout.write(`${style(frame, 'cyan')} ${style(`[${elapsed}s]`, 'yellow')} 💭 ${this.currentStep}`);
  }

  stop(finalMessage?: string): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }

    process.stdout.write('\r\x1b[K');

    const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(1);
    console.log(style(`✓ ${finalMessage || 'Complete'} (${elapsed}s)`, 'green'));
  }
}

// ============================================================================
// v7.20: Notification Badge
// ============================================================================

export function badge(text: string, colorName: ColorName = 'cyan'): string {
  return style(` ${text} `, colorName, 'bgBlack', 'bold');
}

export function statusBadge(status: 'success' | 'error' | 'warning' | 'info'): string {
  const config: Record<string, { text: string; color: ColorName }> = {
    success: { text: '✓ OK', color: 'green' },
    error: { text: '✗ ERR', color: 'red' },
    warning: { text: '! WARN', color: 'yellow' },
    info: { text: 'ℹ INFO', color: 'cyan' },
  };
  const { text, color } = config[status];
  return badge(text, color);
}

// ============================================================================
// Export All
// ============================================================================

export const UI = {
  // Colors & Styles
  COLORS,
  style,
  c,
  success,
  error,
  warning,
  info,
  muted,
  highlight,

  // Components
  Spinner,
  ThinkingSpinner,
  ProgressBar,
  StatusLine,
  StreamingOutput,
  LiveThinkingDisplay,

  // Formatters
  box,
  table,
  formatMarkdown,
  formatMenu,
  formatAgentTree,
  formatCodeChange,
  formatDiff,
  formatSystemStatus,
  formatImprovementReport,
  formatDaemonStatus,

  // Utilities
  stripAnsi,
  pad,
  truncate,
  formatDuration,
  formatBytes,
  badge,
  statusBadge,

  // Banner
  GENESIS_LOGO,
  showBanner,
  showMainMenu,
  MAIN_MENU,
};

export default UI;
