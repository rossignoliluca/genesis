/**
 * Genesis v7.20 - Sparkline & Micro-Visualization Components
 *
 * Unicode sparklines and micro-visualizations for terminal displays.
 * Provides compact, beautiful data visualizations using Unicode block characters.
 */

// ============================================================================
// ANSI Color Codes
// ============================================================================

const COLORS = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
} as const;

function color(text: string, colorCode: string): string {
  return `${colorCode}${text}${COLORS.reset}`;
}

// ============================================================================
// 1. Sparkline (Braille-based)
// ============================================================================

export interface SparklineOptions {
  width?: number;
  min?: number;
  max?: number;
  color?: keyof typeof COLORS;
}

/**
 * Renders a series of values as braille characters (⣀⣤⣶⣿ etc.)
 * Uses Unicode Braille patterns (U+2800-U+28FF) to create smooth sparklines
 *
 * @example
 * sparkline([1,3,5,7,4,2]) → "⣀⣤⣶⣿⣴⣠"
 */
export function sparkline(values: number[], options: SparklineOptions = {}): string {
  if (values.length === 0) return '';

  const width = options.width ?? values.length;
  const min = options.min ?? Math.min(...values);
  const max = options.max ?? Math.max(...values);
  const range = max - min || 1; // Avoid division by zero

  // Braille characters for different heights (8 levels)
  // These represent bottom-to-top filling patterns
  const braille = ['⠀', '⣀', '⣄', '⣤', '⣦', '⣶', '⣷', '⣿'];

  // Sample values if width differs from values.length
  const sampledValues = sampleValues(values, width);

  // Map each value to a braille character
  let result = '';
  for (const value of sampledValues) {
    const normalized = (value - min) / range;
    const level = Math.round(normalized * (braille.length - 1));
    result += braille[Math.max(0, Math.min(braille.length - 1, level))];
  }

  return options.color ? color(result, COLORS[options.color]) : result;
}

/**
 * Sample values to fit target width
 */
function sampleValues(values: number[], targetWidth: number): number[] {
  if (values.length === targetWidth) return values;

  const sampled: number[] = [];
  const step = values.length / targetWidth;

  for (let i = 0; i < targetWidth; i++) {
    const index = Math.floor(i * step);
    sampled.push(values[index]);
  }

  return sampled;
}

// ============================================================================
// 2. Progress Bar
// ============================================================================

export interface ProgressBarOptions {
  width?: number;
  filled?: string;
  empty?: string;
  showPercent?: boolean;
}

/**
 * Renders a progress bar with filled/empty characters
 *
 * @example
 * progressBar(7, 10, {width: 10}) → "███████░░░ 70%"
 */
export function progressBar(
  value: number,
  max: number,
  options: ProgressBarOptions = {}
): string {
  const width = options.width ?? 20;
  const filled = options.filled ?? '█';
  const empty = options.empty ?? '░';
  const showPercent = options.showPercent ?? true;

  const percent = max > 0 ? value / max : 0;
  const filledCount = Math.round(width * percent);
  const emptyCount = width - filledCount;

  const bar = filled.repeat(filledCount) + empty.repeat(emptyCount);
  const percentText = showPercent ? ` ${Math.round(percent * 100)}%` : '';

  return bar + percentText;
}

// ============================================================================
// 3. Mini Histogram
// ============================================================================

/**
 * Uses block chars: ▁▂▃▄▅▆▇█
 * Maps values to 8 levels
 *
 * @example
 * miniHistogram([1,4,7,3,8,2]) → "▁▄▇▃█▂"
 */
export function miniHistogram(values: number[]): string {
  if (values.length === 0) return '';

  // Block characters from low to high (U+2581 to U+2588)
  const blocks = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  let result = '';
  for (const value of values) {
    const normalized = (value - min) / range;
    const level = Math.round(normalized * (blocks.length - 1));
    result += blocks[Math.max(0, Math.min(blocks.length - 1, level))];
  }

  return result;
}

// ============================================================================
// 4. Confidence Bar
// ============================================================================

/**
 * Colored confidence bar (0-1 scale)
 * Green (>0.8), yellow (0.5-0.8), red (<0.5)
 *
 * @example
 * confidenceBar(0.85) → "████████░░" (green)
 */
export function confidenceBar(value: number, width: number = 10): string {
  const filled = Math.round(value * width);
  const empty = width - filled;

  const barColor = value > 0.8 ? COLORS.green
                 : value >= 0.5 ? COLORS.yellow
                 : COLORS.red;

  return color('█'.repeat(filled), barColor) + color('░'.repeat(empty), COLORS.dim);
}

// ============================================================================
// 5. Trend Indicator
// ============================================================================

/**
 * Returns trend arrow based on current vs previous value
 * Returns: "↑" (green), "↓" (red), "→" (dim), "↗" (yellow), "↘" (yellow)
 */
export function trendIndicator(current: number, previous: number): string {
  const diff = current - previous;
  const percentChange = previous !== 0 ? Math.abs(diff / previous) : 0;

  if (Math.abs(diff) < 0.001) {
    return color('→', COLORS.dim);
  }

  // Strong change (>10%)
  if (percentChange > 0.1) {
    if (diff > 0) return color('↑', COLORS.green);
    else return color('↓', COLORS.red);
  }

  // Moderate change
  if (diff > 0) return color('↗', COLORS.yellow);
  else return color('↘', COLORS.yellow);
}

// ============================================================================
// 6. Cost Meter
// ============================================================================

/**
 * Mini bar with color coding for cost tracking
 *
 * @example
 * costMeter(0.003, 0.01) → "$0.003 ▓▓▓░░░░░░░"
 */
export function costMeter(cost: number, budget: number, width: number = 10): string {
  const ratio = budget > 0 ? cost / budget : 0;
  const filled = Math.round(ratio * width);
  const empty = width - filled;

  // Color based on usage
  const barColor = ratio > 0.9 ? COLORS.red
                 : ratio > 0.7 ? COLORS.yellow
                 : COLORS.green;

  // Format cost (use millicents for tiny costs)
  const costStr = cost < 0.001
    ? `$${(cost * 1000).toFixed(2)}m`
    : `$${cost.toFixed(3)}`;

  const bar = color('▓'.repeat(filled), barColor) + color('░'.repeat(empty), COLORS.dim);

  return `${costStr} ${bar}`;
}

// ============================================================================
// 7. Latency Indicator
// ============================================================================

/**
 * Color-coded latency indicator
 * Green (<100ms), yellow (<500ms), red (>500ms)
 *
 * @example
 * latencyIndicator(45) → "45ms ●" (green dot)
 */
export function latencyIndicator(ms: number): string {
  const dotColor = ms < 100 ? COLORS.green
                 : ms < 500 ? COLORS.yellow
                 : COLORS.red;

  const dot = color('●', dotColor);
  return `${ms}ms ${dot}`;
}

// ============================================================================
// 8. Token Counter
// ============================================================================

/**
 * Shows token usage with color when approaching limit
 *
 * @example
 * tokenCounter(3500, 4096) → "3.5k/4k ▓▓▓▓▓▓▓▓░░"
 */
export function tokenCounter(current: number, max: number, width: number = 10): string {
  const ratio = max > 0 ? current / max : 0;
  const filled = Math.round(ratio * width);
  const empty = width - filled;

  // Color based on usage
  const barColor = ratio > 0.9 ? COLORS.red
                 : ratio > 0.7 ? COLORS.yellow
                 : COLORS.cyan;

  // Format numbers (k for thousands)
  const formatNum = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
  const label = `${formatNum(current)}/${formatNum(max)}`;

  const bar = color('▓'.repeat(filled), barColor) + color('░'.repeat(empty), COLORS.dim);

  return `${label} ${bar}`;
}

// ============================================================================
// Utility: Format Number with Units
// ============================================================================

/**
 * Format a number with SI units (K, M, B)
 */
export function formatNumber(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return String(n);
}

// ============================================================================
// Utility: Percentage Bar
// ============================================================================

/**
 * Generic percentage bar with customizable appearance
 */
export function percentageBar(
  value: number,
  options: {
    width?: number;
    showValue?: boolean;
    colorThresholds?: Array<{ threshold: number; color: keyof typeof COLORS }>;
  } = {}
): string {
  const width = options.width ?? 10;
  const showValue = options.showValue ?? true;
  const filled = Math.round(value * width);
  const empty = width - filled;

  // Determine color from thresholds
  let barColor: string = COLORS.cyan;
  if (options.colorThresholds) {
    for (const { threshold, color } of options.colorThresholds) {
      if (value >= threshold) {
        barColor = COLORS[color];
      }
    }
  }

  const bar = color('█'.repeat(filled), barColor) + color('░'.repeat(empty), COLORS.dim);
  const valueText = showValue ? ` ${Math.round(value * 100)}%` : '';

  return bar + valueText;
}

// ============================================================================
// Export All
// ============================================================================

export const Sparkline = {
  sparkline,
  progressBar,
  miniHistogram,
  confidenceBar,
  trendIndicator,
  costMeter,
  latencyIndicator,
  tokenCounter,
  formatNumber,
  percentageBar,
};

export default Sparkline;
