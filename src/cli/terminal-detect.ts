/**
 * Terminal capability detection for adaptive UI rendering.
 *
 * Detects color depth, unicode support, dimensions, and advanced features
 * to enable graceful degradation across different terminal environments.
 */

export interface TerminalCapabilities {
  // Display
  colorDepth: 1 | 4 | 8 | 24;  // 1=no color, 4=16 colors, 8=256, 24=truecolor
  unicode: boolean;              // Full unicode support
  emoji: boolean;                // Emoji rendering
  columns: number;               // Terminal width
  rows: number;                  // Terminal height

  // Advanced
  hyperlinks: boolean;           // OSC 8 hyperlink support
  images: boolean;               // Sixel or iTerm2 image protocol
  kittyImages: boolean;          // Kitty image protocol
  braille: boolean;              // Braille characters for sparklines

  // Interaction
  mouse: boolean;                // Mouse event support
  altScreen: boolean;            // Alternate screen buffer

  // Environment
  isTTY: boolean;
  isCI: boolean;                 // CI environment (GitHub Actions, etc.)
  term: string;                  // TERM variable
  termProgram: string;           // TERM_PROGRAM (iTerm2, vscode, etc.)
}

export type LayoutMode = 'compact' | 'normal' | 'wide';

export interface ResponsiveLayout {
  mode: LayoutMode;
  maxWidth: number;
  padding: number;
  showSparklines: boolean;
  shortLabels: boolean;
  sidePanels: boolean;
  extendedInfo: boolean;
}

/**
 * Detect terminal capabilities based on environment variables and TTY status.
 */
export function detectTerminal(): TerminalCapabilities {
  const env = process.env;
  const stdout = process.stdout;

  // TTY detection
  const isTTY = stdout.isTTY ?? false;

  // CI detection
  const isCI = !!(
    env.CI ||
    env.GITHUB_ACTIONS ||
    env.JENKINS ||
    env.TRAVIS ||
    env.CIRCLECI ||
    env.GITLAB_CI
  );

  // Environment
  const term = env.TERM || 'unknown';
  const termProgram = env.TERM_PROGRAM || '';

  // Color depth detection
  const colorDepth = detectColorDepth(env, term);

  // Modern terminals with full unicode
  const modernTerminals = [
    'iTerm.app',
    'vscode',
    'WarpTerminal',
    'xterm-kitty',
    'kitty',
    'WezTerm',
    'Ghostty',
    'Hyper',
    'Alacritty'
  ];

  const isModern = modernTerminals.some(t =>
    termProgram.includes(t) || term.includes(t)
  );

  // Unicode detection
  const hasUTF8Lang = (env.LANG || '').toUpperCase().includes('UTF-8') ||
                      (env.LC_ALL || '').toUpperCase().includes('UTF-8');
  const unicode = hasUTF8Lang || isModern;

  // Emoji support (unicode + not CI + not dumb terminal)
  const emoji = unicode && !isCI && term !== 'dumb';

  // Dimensions with fallback
  const columns = stdout.columns || 80;
  const rows = stdout.rows || 24;

  // Hyperlink support (OSC 8)
  const hyperlinkTerminals = [
    'iTerm.app',
    'vscode',
    'WarpTerminal',
    'WezTerm',
    'Ghostty',
    'Konsole'
  ];
  const hyperlinks = hyperlinkTerminals.some(t => termProgram.includes(t)) ||
                     term.includes('kitty');

  // Image support
  const images = termProgram === 'iTerm.app' ||
                 term.includes('kitty') ||
                 !!env.SIXEL;

  // Kitty-specific image protocol
  const kittyImages = term.includes('kitty');

  // Braille characters (part of unicode)
  const braille = unicode;

  // Interactive features
  const mouse = isTTY && !isCI && term !== 'dumb';
  const altScreen = isTTY && !isCI && term !== 'dumb';

  return {
    colorDepth,
    unicode,
    emoji,
    columns,
    rows,
    hyperlinks,
    images,
    kittyImages,
    braille,
    mouse,
    altScreen,
    isTTY,
    isCI,
    term,
    termProgram
  };
}

/**
 * Detect color depth from environment.
 */
function detectColorDepth(
  env: NodeJS.ProcessEnv,
  term: string
): 1 | 4 | 8 | 24 {
  // NO_COLOR standard
  if (env.NO_COLOR) {
    return 1;
  }

  // Explicit truecolor
  const colorTerm = env.COLORTERM || '';
  if (colorTerm === 'truecolor' || colorTerm === '24bit') {
    return 24;
  }

  // 256 color support
  if (term.includes('256color') || term.includes('256')) {
    return 8;
  }

  // Dumb or unknown terminals
  if (term === 'dumb' || term === 'unknown') {
    return 1;
  }

  // Default to 16 colors (basic ANSI)
  return 4;
}

/**
 * Get responsive layout configuration based on terminal width.
 */
export function getResponsiveLayout(caps: TerminalCapabilities): ResponsiveLayout {
  const { columns } = caps;

  if (columns < 60) {
    return {
      mode: 'compact',
      maxWidth: columns,
      padding: 0,
      showSparklines: false,
      shortLabels: true,
      sidePanels: false,
      extendedInfo: false
    };
  }

  if (columns > 120) {
    return {
      mode: 'wide',
      maxWidth: columns,
      padding: 2,
      showSparklines: true,
      shortLabels: false,
      sidePanels: true,
      extendedInfo: true
    };
  }

  return {
    mode: 'normal',
    maxWidth: columns,
    padding: 1,
    showSparklines: true,
    shortLabels: false,
    sidePanels: false,
    extendedInfo: false
  };
}

/**
 * Watch for terminal resize events.
 * Returns a cleanup function to stop watching.
 */
export function watchTerminalResize(
  callback: (caps: TerminalCapabilities) => void
): () => void {
  const handler = () => {
    callback(detectTerminal());
  };

  process.stdout.on('resize', handler);

  return () => {
    process.stdout.off('resize', handler);
  };
}

/**
 * Create a debug summary of terminal capabilities.
 */
export function debugCapabilities(caps: TerminalCapabilities): string {
  const lines = [
    '=== Terminal Capabilities ===',
    `TTY: ${caps.isTTY}`,
    `CI: ${caps.isCI}`,
    `Terminal: ${caps.term}`,
    `Program: ${caps.termProgram || '(none)'}`,
    `Dimensions: ${caps.columns}x${caps.rows}`,
    '',
    '--- Display ---',
    `Color depth: ${caps.colorDepth}-bit`,
    `Unicode: ${caps.unicode}`,
    `Emoji: ${caps.emoji}`,
    `Braille: ${caps.braille}`,
    '',
    '--- Advanced ---',
    `Hyperlinks: ${caps.hyperlinks}`,
    `Images: ${caps.images}`,
    `Kitty images: ${caps.kittyImages}`,
    '',
    '--- Interaction ---',
    `Mouse: ${caps.mouse}`,
    `Alt screen: ${caps.altScreen}`
  ];

  return lines.join('\n');
}
