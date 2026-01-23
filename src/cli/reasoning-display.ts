/**
 * Progressive reasoning display with 6 disclosure levels.
 * Replaces ThinkingSpinner and LiveThinkingDisplay with structured reasoning visualization.
 */

export type DisclosureLevel = 0 | 1 | 2 | 3 | 4 | 5;

export interface ReasoningNode {
  id: string;
  type: 'thought' | 'decision' | 'hypothesis' | 'evaluation' | 'conclusion';
  content: string;
  confidence: number;
  children: ReasoningNode[];
  timestamp: number;
  meta?: {
    alternatives?: string[];
    evidence?: string[];
    uncertainty?: string;
  };
}

export interface ReasoningStream {
  level: DisclosureLevel;
  nodes: ReasoningNode[];
  currentPhase: string;
  elapsed: number;
}

const SPINNERS = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const TYPE_ICONS: Record<ReasoningNode['type'], string> = {
  thought: '◆',
  decision: '◇',
  hypothesis: '◈',
  evaluation: '◎',
  conclusion: '◉'
};

export class ReasoningDisplay {
  private level: DisclosureLevel = 2;
  private nodes: ReasoningNode[] = [];
  private startTime: number = 0;
  private currentLine: string = '';
  private lastRender: string = '';
  private lastRenderLines: number = 0;
  private spinnerIndex: number = 0;
  private nodeMap: Map<string, ReasoningNode> = new Map();
  private currentPhase: string = 'thinking';
  private tokenBuffer: string = '';

  constructor(level?: DisclosureLevel) {
    if (level !== undefined) {
      this.level = level;
    }
    this.startTime = Date.now();
  }

  setLevel(level: DisclosureLevel): void {
    this.level = level;
  }

  getLevel(): DisclosureLevel {
    return this.level;
  }

  addToken(token: string, confidence?: number): void {
    this.tokenBuffer += token;

    // For level 5 (debug), we track raw tokens
    if (this.level === 5 && confidence !== undefined) {
      this.currentLine += `${token}[${confidence.toFixed(2)}]`;
    }
  }

  startThought(type: ReasoningNode['type'], preview?: string): string {
    const id = `node-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const node: ReasoningNode = {
      id,
      type,
      content: preview || '',
      confidence: 0,
      children: [],
      timestamp: Date.now(),
      meta: {}
    };

    this.nodes.push(node);
    this.nodeMap.set(id, node);

    return id;
  }

  endThought(id: string, conclusion: string, confidence: number): void {
    const node = this.nodeMap.get(id);
    if (node) {
      node.content = conclusion;
      node.confidence = confidence;
    }
  }

  addAlternative(thoughtId: string, alt: string): void {
    const node = this.nodeMap.get(thoughtId);
    if (node) {
      if (!node.meta) node.meta = {};
      if (!node.meta.alternatives) node.meta.alternatives = [];
      node.meta.alternatives.push(alt);
    }
  }

  addEvidence(thoughtId: string, evidence: string): void {
    const node = this.nodeMap.get(thoughtId);
    if (node) {
      if (!node.meta) node.meta = {};
      if (!node.meta.evidence) node.meta.evidence = [];
      node.meta.evidence.push(evidence);
    }
  }

  setUncertainty(thoughtId: string, uncertainty: string): void {
    const node = this.nodeMap.get(thoughtId);
    if (node) {
      if (!node.meta) node.meta = {};
      node.meta.uncertainty = uncertainty;
    }
  }

  setPhase(phase: string): void {
    this.currentPhase = phase;
  }

  render(): string {
    this.spinnerIndex = (this.spinnerIndex + 1) % SPINNERS.length;
    const elapsed = this.getElapsedSeconds();

    switch (this.level) {
      case 0:
        return '';
      case 1:
        return this.renderLevel1(elapsed);
      case 2:
        return this.renderLevel2(elapsed);
      case 3:
        return this.renderLevel3(elapsed);
      case 4:
        return this.renderLevel4(elapsed);
      case 5:
        return this.renderLevel5(elapsed);
      default:
        return this.renderLevel2(elapsed);
    }
  }

  private renderLevel1(elapsed: string): string {
    const spinner = SPINNERS[this.spinnerIndex];
    return `${spinner} Thinking... (${elapsed})`;
  }

  private renderLevel2(elapsed: string): string {
    const spinner = SPINNERS[this.spinnerIndex];
    const summary = this.getSummary();
    return `${spinner} ${summary} (${elapsed})`;
  }

  private renderLevel3(elapsed: string): string {
    const width = 50;
    const lines: string[] = [];

    lines.push('┌─ Reasoning ' + '─'.repeat(width - 12) + '┐');

    // Group nodes by type
    const thoughts = this.nodes.filter(n => n.type === 'thought' && n.content);
    const decisions = this.nodes.filter(n => n.type === 'decision' && n.content);
    const conclusions = this.nodes.filter(n => n.type === 'conclusion' && n.content);

    if (thoughts.length > 0) {
      const latest = thoughts[thoughts.length - 1];
      lines.push(`│ • Analyzing: ${this.truncate(latest.content, width - 15)}`);
    }

    if (decisions.length > 0) {
      const latest = decisions[decisions.length - 1];
      const altCount = latest.meta?.alternatives?.length || 0;
      const altText = altCount > 0 ? ` (${altCount} options)` : '';
      lines.push(`│ • Considering: ${this.truncate(latest.content, width - 18)}${altText}`);
    }

    if (conclusions.length > 0) {
      const latest = conclusions[conclusions.length - 1];
      const conf = latest.confidence > 0 ? ` (confidence: ${latest.confidence.toFixed(2)})` : '';
      lines.push(`│ • Decided: ${this.truncate(latest.content, width - 15)}${conf}`);
    }

    if (lines.length === 1) {
      lines.push(`│ • ${this.currentPhase}...`);
    }

    const footer = '└' + '─'.repeat(width - elapsed.length - 2) + ' ' + elapsed;
    lines.push(footer);

    return lines.join('\n');
  }

  private renderLevel4(elapsed: string): string {
    const width = 60;
    const lines: string[] = [];

    lines.push('┌─ Reasoning ' + '─'.repeat(width - 12) + '┐');

    for (const node of this.nodes) {
      if (!node.content) continue;

      const icon = TYPE_ICONS[node.type];
      const markers = this.getMetaCognitionMarkers(node);
      const markerText = markers.length > 0 ? ` ${markers.join(' ')}` : '';

      lines.push(`│ ${icon} ${node.content}${markerText}`);

      // Show alternatives for decisions
      if (node.type === 'decision' && node.meta?.alternatives) {
        for (const alt of node.meta.alternatives) {
          lines.push(`│   ├─ ${alt}`);
        }
        if (node.confidence > 0) {
          lines.push(`│   └─ Selected (${node.confidence.toFixed(2)}) ✓`);
        }
      }

      // Show evidence
      if (node.meta?.evidence && node.meta.evidence.length > 0) {
        for (let i = 0; i < node.meta.evidence.length; i++) {
          const ev = node.meta.evidence[i];
          const prefix = i === node.meta.evidence.length - 1 ? '└─' : '├─';
          lines.push(`│   ${prefix} Evidence: ${this.truncate(ev, width - 20)}`);
        }
      }

      // Show children
      if (node.children.length > 0) {
        for (const child of node.children) {
          lines.push(`│   └─ ${child.content}`);
        }
      }
    }

    if (lines.length === 1) {
      lines.push(`│ ${TYPE_ICONS.thought} ${this.currentPhase}...`);
    }

    const footer = '└' + '─'.repeat(width - elapsed.length - 2) + ' ' + elapsed;
    lines.push(footer);

    return lines.join('\n');
  }

  private renderLevel5(elapsed: string): string {
    const lines: string[] = [];

    lines.push('=== DEBUG: Raw Reasoning Stream ===');
    lines.push(`Phase: ${this.currentPhase} | Elapsed: ${elapsed}`);
    lines.push('');

    for (const node of this.nodes) {
      const conf = node.confidence > 0 ? `[conf:${node.confidence.toFixed(2)}]` : '[conf:??]';
      lines.push(`[${node.type}] ${conf} ${node.content}`);

      if (node.meta?.alternatives) {
        lines.push(`  alternatives: ${JSON.stringify(node.meta.alternatives)}`);
      }
      if (node.meta?.evidence) {
        lines.push(`  evidence: ${JSON.stringify(node.meta.evidence)}`);
      }
      if (node.meta?.uncertainty) {
        lines.push(`  uncertainty: ${node.meta.uncertainty}`);
      }

      lines.push('');
    }

    if (this.tokenBuffer) {
      lines.push('--- Token Buffer ---');
      lines.push(this.tokenBuffer);
    }

    if (this.currentLine) {
      lines.push('--- Current Line ---');
      lines.push(this.currentLine);
    }

    return lines.join('\n');
  }

  private getMetaCognitionMarkers(node: ReasoningNode): string[] {
    const markers: string[] = [];

    if (node.confidence > 0 && node.confidence < 0.5) {
      markers.push('[uncertain]');
    }

    if (node.meta?.uncertainty) {
      markers.push('[assumption]');
    }

    // Check if this node contradicts a previous one (self-correction)
    const previousSimilar = this.nodes
      .slice(0, this.nodes.indexOf(node))
      .filter(n => n.type === node.type && n.content !== node.content);

    if (previousSimilar.length > 0) {
      markers.push('[self-correcting]');
    }

    return markers;
  }

  getSummary(): string {
    if (this.nodes.length === 0) {
      return `${this.currentPhase}...`;
    }

    const recentNodes = this.nodes.slice(-3);
    const parts: string[] = [];

    for (const node of recentNodes) {
      if (node.content) {
        const verb = this.getVerbForType(node.type);
        parts.push(`${verb} ${this.truncate(node.content, 30)}`);
      }
    }

    return parts.length > 0 ? parts.join(' → ') : `${this.currentPhase}...`;
  }

  private getVerbForType(type: ReasoningNode['type']): string {
    switch (type) {
      case 'thought': return 'analyzing';
      case 'decision': return 'deciding';
      case 'hypothesis': return 'considering';
      case 'evaluation': return 'evaluating';
      case 'conclusion': return 'concluded';
      default: return 'processing';
    }
  }

  private getElapsedSeconds(): string {
    const elapsed = (Date.now() - this.startTime) / 1000;
    return `${elapsed.toFixed(1)}s`;
  }

  private truncate(text: string, maxLen: number): string {
    if (text.length <= maxLen) return text;
    return text.substring(0, maxLen - 3) + '...';
  }

  reset(): void {
    this.nodes = [];
    this.nodeMap.clear();
    this.startTime = Date.now();
    this.currentLine = '';
    this.lastRender = '';
    this.lastRenderLines = 0;
    this.spinnerIndex = 0;
    this.currentPhase = 'thinking';
    this.tokenBuffer = '';
  }

  // Get current state as stream object
  getStream(): ReasoningStream {
    return {
      level: this.level,
      nodes: this.nodes,
      currentPhase: this.currentPhase,
      elapsed: (Date.now() - this.startTime) / 1000
    };
  }

  // Clear previous render for update
  clearPrevious(): string {
    if (this.lastRenderLines === 0) return '';

    const moves: string[] = [];
    // Move up and clear each line
    for (let i = 0; i < this.lastRenderLines; i++) {
      moves.push('\x1b[1A'); // Move up one line
      moves.push('\x1b[2K'); // Clear entire line
    }

    return moves.join('');
  }

  // Update display in-place
  update(): string {
    const rendered = this.render();
    const lines = rendered.split('\n');
    this.lastRenderLines = lines.length;
    this.lastRender = rendered;

    return rendered;
  }

  // Convenience method: clear + update
  refresh(): string {
    return this.clearPrevious() + this.update();
  }
}

// Factory function for creating displays
export function createReasoningDisplay(level?: DisclosureLevel): ReasoningDisplay {
  return new ReasoningDisplay(level);
}

// Helper for testing/demo
export function demoReasoningDisplay(): void {
  const display = new ReasoningDisplay(4);

  const t1 = display.startThought('thought', 'Code structure analysis');
  display.endThought(t1, 'Found 32K lines in chat.ts', 0.95);

  const t2 = display.startThought('decision', 'Refactor approach');
  display.addAlternative(t2, 'Split by feature (0.87)');
  display.addAlternative(t2, 'Split by layer (0.72)');
  display.addAlternative(t2, 'Keep monolith (0.31)');
  display.endThought(t2, 'Split by feature', 0.87);
  display.addEvidence(t2, 'Clear feature boundaries exist');

  const t3 = display.startThought('conclusion', 'Implementation plan');
  display.endThought(t3, 'Create modular structure with 5 files', 0.91);

  console.log(display.render());
}
