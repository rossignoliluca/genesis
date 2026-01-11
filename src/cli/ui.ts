/**
 * Genesis v7.2 - Modern UI Components
 *
 * Reusable CLI components for beautiful terminal output.
 * Inspired by Claude Code's clean interface.
 *
 * SELF-MODIFICATION MARKER: This comment was added while Genesis was running.
 * Timestamp: 2026-01-11T07:35:00Z
 * Modified by: Claude Opus 4.5 via Claude Code
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
 * Full markdown-style formatting
 */
export function formatMarkdown(text: string): string {
  let result = text;

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
