/**
 * Block-based message rendering system
 * Inspired by Warp terminal's block architecture
 * Every piece of output is a discrete, navigable, collapsible unit
 */

// Inline colors to keep this file self-contained
const COLORS = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  gray: '\x1b[90m',
  white: '\x1b[97m',
};

export type BlockType =
  | 'text'           // Regular text/markdown
  | 'code'           // Code with syntax highlighting
  | 'tool_call'      // Tool invocation (collapsible)
  | 'tool_result'    // Tool output (collapsible)
  | 'thinking'       // Reasoning block (collapsible)
  | 'error'          // Error message
  | 'system'         // System notification
  | 'metric'         // Sparkline/stats block
  | 'image'          // Image reference (shows path)
  | 'separator';     // Visual divider

export interface Block {
  id: string;
  type: BlockType;
  content: string;
  timestamp: number;
  collapsed: boolean;
  meta?: {
    language?: string;     // For code blocks
    toolName?: string;     // For tool blocks
    duration?: number;     // Execution time
    success?: boolean;     // For tool results
    level?: number;        // Nesting level
  };
}

export interface MessageBlock {
  role: 'user' | 'assistant' | 'system';
  blocks: Block[];
  timestamp: number;
  model?: string;
  cost?: number;
  tokens?: number;
}

export class BlockRenderer {
  private messages: MessageBlock[] = [];
  private termWidth: number;

  constructor(termWidth?: number) {
    this.termWidth = termWidth || process.stdout.columns || 80;
  }

  addMessage(msg: MessageBlock): void {
    this.messages.push(msg);
  }

  renderBlock(block: Block): string {
    switch (block.type) {
      case 'text':
        return this.renderText(block);
      case 'code':
        return this.renderCode(block);
      case 'tool_call':
        return this.renderToolCall(block);
      case 'tool_result':
        return this.renderToolResult(block);
      case 'thinking':
        return this.renderThinking(block);
      case 'error':
        return this.renderError(block);
      case 'system':
        return this.renderSystem(block);
      case 'metric':
        return this.renderMetrics(block);
      case 'image':
        return this.renderImage(block);
      case 'separator':
        return this.renderSeparator(block);
      default:
        return block.content;
    }
  }

  renderText(block: Block): string {
    return this.wrapText(block.content, this.termWidth);
  }

  renderCode(block: Block): string {
    const lang = block.meta?.language || 'code';
    const borderWidth = this.termWidth;
    const contentWidth = borderWidth - 4; // Account for "│ " prefix and padding

    const topBorder = `${COLORS.gray}┌─ ${COLORS.cyan}${lang}${COLORS.gray} ${'─'.repeat(Math.max(0, borderWidth - lang.length - 5))}${COLORS.reset}`;
    const bottomBorder = `${COLORS.gray}└${'─'.repeat(borderWidth - 1)}${COLORS.reset}`;

    const lines = block.content.split('\n');
    const highlightedLines = lines.map(line => {
      const highlighted = this.highlightSyntax(line);
      const truncated = this.truncate(highlighted, contentWidth);
      return `${COLORS.gray}│${COLORS.reset} ${truncated}`;
    });

    return [topBorder, ...highlightedLines, bottomBorder].join('\n');
  }

  renderToolCall(block: Block): string {
    const toolName = block.meta?.toolName || 'tool';
    const duration = block.meta?.duration || 0;
    const success = block.meta?.success !== false;
    const icon = success ? '✓' : '✗';
    const statusColor = success ? COLORS.green : COLORS.red;

    const borderWidth = this.termWidth;
    const topBorder = `${COLORS.gray}┌─ ${COLORS.blue}🔧 ${toolName}${COLORS.gray} ${'─'.repeat(Math.max(0, borderWidth - toolName.length - 7))}${COLORS.reset}`;

    const contentLines = block.content.split('\n').map(line => {
      const truncated = this.truncate(line, borderWidth - 4);
      return `${COLORS.gray}│${COLORS.reset} ${truncated}`;
    });

    const durationText = duration > 0 ? `${duration}ms` : '';
    const bottomPadding = Math.max(0, borderWidth - durationText.length - 4);
    const bottomBorder = `${COLORS.gray}└${'─'.repeat(bottomPadding)} ${COLORS.dim}${durationText}${COLORS.reset} ${statusColor}${icon}${COLORS.reset}`;

    return [topBorder, ...contentLines, bottomBorder].join('\n');
  }

  renderToolResult(block: Block): string {
    if (block.collapsed) {
      return `${COLORS.gray}▸ ${COLORS.dim}Result (click to expand)${COLORS.reset}`;
    }

    const success = block.meta?.success !== false;
    const statusColor = success ? COLORS.green : COLORS.red;
    const borderWidth = this.termWidth;

    const topBorder = `${COLORS.gray}┌─ ${statusColor}Result${COLORS.gray} ${'─'.repeat(Math.max(0, borderWidth - 9))}${COLORS.reset}`;
    const bottomBorder = `${COLORS.gray}└${'─'.repeat(borderWidth - 1)}${COLORS.reset}`;

    const contentLines = block.content.split('\n').slice(0, 20).map(line => {
      const truncated = this.truncate(line, borderWidth - 4);
      return `${COLORS.gray}│${COLORS.reset} ${COLORS.dim}${truncated}${COLORS.reset}`;
    });

    return [topBorder, ...contentLines, bottomBorder].join('\n');
  }

  renderThinking(block: Block): string {
    if (block.collapsed) {
      return `${COLORS.gray}▸ ${COLORS.dim}Thinking... (click to expand)${COLORS.reset}`;
    }

    const borderWidth = this.termWidth;
    const topBorder = `${COLORS.gray}▾ ${COLORS.magenta}Reasoning:${COLORS.reset}`;

    const lines = block.content.split('\n').map(line => {
      const indented = `  ${COLORS.dim}• ${line}${COLORS.reset}`;
      return this.truncate(indented, borderWidth);
    });

    return [topBorder, ...lines].join('\n');
  }

  renderError(block: Block): string {
    const borderWidth = this.termWidth;
    const lines = block.content.split('\n');

    const header = `${COLORS.red}✗ Error:${COLORS.reset} ${lines[0]}`;
    const rest = lines.slice(1).map(line => {
      const indented = `  ${COLORS.dim}→ ${line}${COLORS.reset}`;
      return this.truncate(indented, borderWidth);
    });

    return [header, ...rest].join('\n');
  }

  renderSystem(block: Block): string {
    return `${COLORS.blue}ℹ ${COLORS.dim}${block.content}${COLORS.reset}`;
  }

  renderMetrics(block: Block): string {
    const borderWidth = this.termWidth;
    const topBorder = `${COLORS.gray}┌─ ${COLORS.cyan}Metrics${COLORS.gray} ${'─'.repeat(Math.max(0, borderWidth - 10))}${COLORS.reset}`;
    const bottomBorder = `${COLORS.gray}└${'─'.repeat(borderWidth - 1)}${COLORS.reset}`;

    try {
      const metrics = JSON.parse(block.content);
      const lines: string[] = [];

      if (metrics.tokensPerSec) {
        const sparkline = this.createSparkline(metrics.tokensPerSec);
        lines.push(`${COLORS.gray}│${COLORS.reset} Tokens/s: ${sparkline} ${COLORS.dim}(avg: ${Math.round(metrics.tokensPerSec.reduce((a: number, b: number) => a + b, 0) / metrics.tokensPerSec.length)})${COLORS.reset}`);
      }

      if (metrics.cost !== undefined) {
        const costBar = this.createBar(metrics.cost, 0.01);
        lines.push(`${COLORS.gray}│${COLORS.reset} Cost: $${metrics.cost.toFixed(4)} ${costBar}`);
      }

      if (metrics.confidence !== undefined) {
        const confidenceBar = this.createBar(metrics.confidence, 100);
        lines.push(`${COLORS.gray}│${COLORS.reset} Confidence: ${confidenceBar} ${Math.round(metrics.confidence)}%`);
      }

      return [topBorder, ...lines, bottomBorder].join('\n');
    } catch (err) {
      console.error('[block-renderer] render failed:', err);
      return `${COLORS.gray}│${COLORS.reset} ${COLORS.dim}${block.content}${COLORS.reset}`;
    }
  }

  renderImage(block: Block): string {
    return `${COLORS.blue}🖼  ${COLORS.cyan}${block.content}${COLORS.reset}`;
  }

  renderSeparator(block: Block): string {
    const label = block.content || 'genesis';
    const totalWidth = this.termWidth;
    const labelWidth = label.length + 2;
    const leftDashes = Math.floor((totalWidth - labelWidth) / 2);
    const rightDashes = totalWidth - labelWidth - leftDashes;

    return `${COLORS.gray}${'─'.repeat(leftDashes)} ${label} ${'─'.repeat(rightDashes)}${COLORS.reset}`;
  }

  renderAll(): string {
    const output: string[] = [];

    for (let i = 0; i < this.messages.length; i++) {
      const msg = this.messages[i];

      // Add separator before assistant messages
      if (msg.role === 'assistant') {
        output.push(this.renderSeparator({
          id: `sep-${i}`,
          type: 'separator',
          content: 'genesis',
          timestamp: msg.timestamp,
          collapsed: false
        }));
      } else if (msg.role === 'user') {
        output.push(this.renderSeparator({
          id: `sep-${i}`,
          type: 'separator',
          content: 'user',
          timestamp: msg.timestamp,
          collapsed: false
        }));
      }

      // Render all blocks in the message
      for (const block of msg.blocks) {
        output.push(this.renderBlock(block));
      }

      // Add metadata footer for assistant messages
      if (msg.role === 'assistant' && (msg.model || msg.cost || msg.tokens)) {
        const meta: string[] = [];
        if (msg.model) meta.push(`${COLORS.dim}model: ${msg.model}${COLORS.reset}`);
        if (msg.tokens) meta.push(`${COLORS.dim}tokens: ${msg.tokens}${COLORS.reset}`);
        if (msg.cost) meta.push(`${COLORS.dim}cost: $${msg.cost.toFixed(4)}${COLORS.reset}`);

        if (meta.length > 0) {
          output.push(`${COLORS.gray}${meta.join(' • ')}${COLORS.reset}`);
        }
      }

      output.push(''); // Empty line between messages
    }

    return output.join('\n');
  }

  renderLast(): string {
    if (this.messages.length === 0) return '';

    const msg = this.messages[this.messages.length - 1];
    const output: string[] = [];

    // Add separator
    const label = msg.role === 'assistant' ? 'genesis' : msg.role;
    output.push(this.renderSeparator({
      id: 'sep-last',
      type: 'separator',
      content: label,
      timestamp: msg.timestamp,
      collapsed: false
    }));

    // Render blocks
    for (const block of msg.blocks) {
      output.push(this.renderBlock(block));
    }

    // Add metadata footer
    if (msg.role === 'assistant' && (msg.model || msg.cost || msg.tokens)) {
      const meta: string[] = [];
      if (msg.model) meta.push(`${COLORS.dim}model: ${msg.model}${COLORS.reset}`);
      if (msg.tokens) meta.push(`${COLORS.dim}tokens: ${msg.tokens}${COLORS.reset}`);
      if (msg.cost) meta.push(`${COLORS.dim}cost: $${msg.cost.toFixed(4)}${COLORS.reset}`);

      if (meta.length > 0) {
        output.push(`${COLORS.gray}${meta.join(' • ')}${COLORS.reset}`);
      }
    }

    return output.join('\n');
  }

  toggleBlock(blockId: string): void {
    for (const msg of this.messages) {
      for (const block of msg.blocks) {
        if (block.id === blockId) {
          block.collapsed = !block.collapsed;
          return;
        }
      }
    }
  }

  // Helper: Simple syntax highlighting
  private highlightSyntax(line: string): string {
    let result = line;

    // Keywords
    const keywords = ['function', 'const', 'let', 'var', 'return', 'if', 'else', 'for', 'while', 'class', 'interface', 'type', 'import', 'export', 'async', 'await'];
    for (const kw of keywords) {
      const regex = new RegExp(`\\b(${kw})\\b`, 'g');
      result = result.replace(regex, `${COLORS.cyan}$1${COLORS.reset}`);
    }

    // Strings
    result = result.replace(/(['"`])(?:(?!\1).)*\1/g, `${COLORS.green}$&${COLORS.reset}`);

    // Numbers
    result = result.replace(/\b\d+(\.\d+)?\b/g, `${COLORS.yellow}$&${COLORS.reset}`);

    // Comments
    result = result.replace(/\/\/.*$/g, `${COLORS.dim}$&${COLORS.reset}`);
    result = result.replace(/\/\*[\s\S]*?\*\//g, `${COLORS.dim}$&${COLORS.reset}`);

    return result;
  }

  // Helper: Wrap text to terminal width
  private wrapText(text: string, width: number): string {
    const lines: string[] = [];
    const paragraphs = text.split('\n');

    for (const para of paragraphs) {
      if (para.length <= width) {
        lines.push(para);
      } else {
        const words = para.split(' ');
        let currentLine = '';

        for (const word of words) {
          if ((currentLine + ' ' + word).trim().length <= width) {
            currentLine = (currentLine + ' ' + word).trim();
          } else {
            if (currentLine) lines.push(currentLine);
            currentLine = word;
          }
        }
        if (currentLine) lines.push(currentLine);
      }
    }

    return lines.join('\n');
  }

  // Helper: Truncate line to width
  private truncate(text: string, width: number): string {
    // Remove ANSI codes for length calculation
    const cleanText = text.replace(/\x1b\[\d+m/g, '');
    if (cleanText.length <= width) return text;

    // Truncate but preserve ANSI codes
    let visibleLength = 0;
    let result = '';
    let inAnsi = false;

    for (let i = 0; i < text.length; i++) {
      const char = text[i];

      if (char === '\x1b') {
        inAnsi = true;
      }

      result += char;

      if (!inAnsi) {
        visibleLength++;
        if (visibleLength >= width - 3) {
          result += `${COLORS.dim}...${COLORS.reset}`;
          break;
        }
      }

      if (inAnsi && char === 'm') {
        inAnsi = false;
      }
    }

    return result;
  }

  // Helper: Create sparkline from array of numbers
  private createSparkline(data: number[]): string {
    if (data.length === 0) return '';

    const chars = ['▁', '▃', '▅', '▇'];
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;

    return data.map(val => {
      const normalized = (val - min) / range;
      const idx = Math.min(chars.length - 1, Math.floor(normalized * chars.length));
      return chars[idx];
    }).join('');
  }

  // Helper: Create progress bar
  private createBar(value: number, max: number): string {
    const barWidth = 10;
    const filled = Math.round((value / max) * barWidth);
    const empty = barWidth - filled;

    return `${COLORS.cyan}${'█'.repeat(filled)}${COLORS.gray}${'░'.repeat(empty)}${COLORS.reset}`;
  }
}

// Factory functions for common block types
export function createTextBlock(content: string, id?: string): Block {
  return {
    id: id || `text-${Date.now()}`,
    type: 'text',
    content,
    timestamp: Date.now(),
    collapsed: false,
  };
}

export function createCodeBlock(content: string, language?: string, id?: string): Block {
  return {
    id: id || `code-${Date.now()}`,
    type: 'code',
    content,
    timestamp: Date.now(),
    collapsed: false,
    meta: { language },
  };
}

export function createToolCallBlock(toolName: string, content: string, duration?: number, success?: boolean, id?: string): Block {
  return {
    id: id || `tool-call-${Date.now()}`,
    type: 'tool_call',
    content,
    timestamp: Date.now(),
    collapsed: false,
    meta: { toolName, duration, success },
  };
}

export function createToolResultBlock(content: string, success?: boolean, id?: string): Block {
  return {
    id: id || `tool-result-${Date.now()}`,
    type: 'tool_result',
    content,
    timestamp: Date.now(),
    collapsed: true,
    meta: { success },
  };
}

export function createThinkingBlock(content: string, id?: string): Block {
  return {
    id: id || `thinking-${Date.now()}`,
    type: 'thinking',
    content,
    timestamp: Date.now(),
    collapsed: true,
  };
}

export function createErrorBlock(content: string, id?: string): Block {
  return {
    id: id || `error-${Date.now()}`,
    type: 'error',
    content,
    timestamp: Date.now(),
    collapsed: false,
  };
}

export function createSystemBlock(content: string, id?: string): Block {
  return {
    id: id || `system-${Date.now()}`,
    type: 'system',
    content,
    timestamp: Date.now(),
    collapsed: false,
  };
}
