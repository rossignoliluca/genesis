/**
 * Genesis System Monitor v27.0
 *
 * Real-time terminal dashboard showing:
 * - System health and phi level
 * - Active bounties and their status
 * - Content queue and publishing
 * - Decision engine state
 * - Resource usage
 * - Recent events
 *
 * Uses ANSI escape codes for terminal UI.
 *
 * @module cli/monitor
 * @version 27.0.0
 */

import { getEventBus, type GenesisEventBus } from '../bus/index.js';
import { getMemorySystem } from '../memory/index.js';
import { getCognitiveBridge } from '../integration/cognitive-bridge.js';
import { getPhiMonitor } from '../consciousness/phi-monitor.js';
import { getDecisionEngine } from '../autonomous/decision-engine.js';
import { getBountyOrchestrator } from '../economy/bounty-orchestrator.js';
import { getContentIntelligence } from '../content/intelligence.js';

// ============================================================================
// ANSI Escape Codes
// ============================================================================

const ANSI = {
  // Cursor
  hide: '\x1b[?25l',
  show: '\x1b[?25h',
  home: '\x1b[H',
  clear: '\x1b[2J',
  clearLine: '\x1b[2K',

  // Colors
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',

  // Foreground
  black: '\x1b[30m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',

  // Background
  bgBlack: '\x1b[40m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
  bgBlue: '\x1b[44m',
  bgMagenta: '\x1b[45m',
  bgCyan: '\x1b[46m',
  bgWhite: '\x1b[47m',
};

// ============================================================================
// Types
// ============================================================================

export interface MonitorConfig {
  refreshRate: number;  // ms
  showMemory: boolean;
  showBounties: boolean;
  showContent: boolean;
  showDecisions: boolean;
  showEvents: boolean;
  maxEvents: number;
  width: number;
}

interface MonitorState {
  phi: number;
  phiState: string;
  phiTrend: string;
  memoryStats: { episodic: number; semantic: number; procedural: number };
  decisionStats: { total: number; successRate: number; mode: string; pending: number };
  bountyStats: { active: number; completed: number; failed: number; revenue: number };
  contentStats: { ideas: number; viral: number; topPlatform: string | null };
  recentEvents: Array<{ time: string; type: string; message: string }>;
  uptime: number;
  heapUsed: number;
  heapTotal: number;
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: MonitorConfig = {
  refreshRate: 1000,
  showMemory: true,
  showBounties: true,
  showContent: true,
  showDecisions: true,
  showEvents: true,
  maxEvents: 10,
  width: 80,
};

// ============================================================================
// System Monitor
// ============================================================================

export class SystemMonitor {
  private config: MonitorConfig;
  private bus: GenesisEventBus;
  private running = false;
  private timer: NodeJS.Timeout | null = null;
  private events: Array<{ time: Date; type: string; message: string }> = [];
  private startTime = Date.now();

  constructor(config?: Partial<MonitorConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.bus = getEventBus();
    this.setupEventListeners();
  }

  // ===========================================================================
  // Event Listening
  // ===========================================================================

  private setupEventListeners(): void {
    // Capture important events
    const captureEvent = (type: string) => (event: any) => {
      this.events.unshift({
        time: new Date(),
        type,
        message: this.formatEventMessage(event),
      });
      if (this.events.length > this.config.maxEvents * 2) {
        this.events = this.events.slice(0, this.config.maxEvents);
      }
    };

    this.bus.subscribePrefix('decision.', captureEvent('decision'));
    this.bus.subscribePrefix('bounty.', captureEvent('bounty'));
    this.bus.subscribePrefix('content.', captureEvent('content'));
    this.bus.subscribePrefix('consciousness.', captureEvent('phi'));
    this.bus.subscribePrefix('pain.', captureEvent('pain'));
    this.bus.subscribePrefix('neuromod.', captureEvent('neuro'));
  }

  private formatEventMessage(event: any): string {
    const topic = event.topic || 'unknown';
    const short = topic.split('.').slice(-1)[0];
    if (event.payload?.message) return `${short}: ${event.payload.message}`;
    if (event.payload?.error) return `${short}: ${event.payload.error}`;
    if (event.payload?.title) return `${short}: ${event.payload.title.slice(0, 30)}`;
    return short;
  }

  // ===========================================================================
  // Data Collection
  // ===========================================================================

  private collectState(): MonitorState {
    // Phi
    const phiMonitor = getPhiMonitor();
    const levelData = phiMonitor.getCurrentLevel?.() ?? null;
    const phi = typeof levelData === 'number' ? levelData : (levelData?.phi ?? 0);

    // Memory
    const memory = getMemorySystem();
    const memoryStats = {
      episodic: memory.episodic.getRecent(1000).length,
      semantic: memory.semantic.count(),
      procedural: memory.procedural.count(),
    };

    // Decisions
    const decisionEngine = getDecisionEngine();
    const decisionStats = decisionEngine.getStats();

    // Bounties
    let bountyStats = { active: 0, completed: 0, failed: 0, revenue: 0 };
    try {
      const orchestrator = getBountyOrchestrator();
      const state = orchestrator.getState();
      bountyStats = {
        active: state.activeBounties.size,
        completed: state.todayStats.bountiesCompleted,
        failed: state.todayStats.bountiesFailed,
        revenue: state.todayStats.revenue,
      };
    } catch {
      // Orchestrator not initialized
    }

    // Content
    let contentStats = { ideas: 0, viral: 0, topPlatform: null as string | null };
    try {
      const intelligence = getContentIntelligence();
      const stats = intelligence.getEngagementStats();
      contentStats = {
        ideas: intelligence.getContentIdeas().length,
        viral: stats.viralCount,
        topPlatform: stats.topPlatform,
      };
    } catch {
      // Content intelligence not initialized
    }

    return {
      phi,
      phiState: phiMonitor.getState?.() ?? 'unknown',
      phiTrend: phiMonitor.getTrend?.() ?? 'stable',
      memoryStats,
      decisionStats: {
        total: decisionStats.totalDecisions,
        successRate: decisionStats.overallSuccessRate,
        mode: decisionStats.currentMode,
        pending: decisionStats.pendingCount,
      },
      bountyStats,
      contentStats,
      recentEvents: this.events.slice(0, this.config.maxEvents).map(e => ({
        time: e.time.toLocaleTimeString(),
        type: e.type,
        message: e.message,
      })),
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
      heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
    };
  }

  // ===========================================================================
  // Rendering
  // ===========================================================================

  private render(state: MonitorState): string {
    const w = this.config.width;
    const lines: string[] = [];

    // Header
    lines.push(this.renderHeader(w));
    lines.push('');

    // System status row
    lines.push(this.renderSystemStatus(state, w));
    lines.push('');

    // Two-column layout
    const leftCol: string[] = [];
    const rightCol: string[] = [];

    // Left: Consciousness + Memory
    leftCol.push(this.renderPhiBox(state));
    if (this.config.showMemory) {
      leftCol.push('');
      leftCol.push(this.renderMemoryBox(state));
    }

    // Right: Decisions + Bounties
    if (this.config.showDecisions) {
      rightCol.push(this.renderDecisionBox(state));
    }
    if (this.config.showBounties) {
      rightCol.push('');
      rightCol.push(this.renderBountyBox(state));
    }

    // Merge columns
    const maxRows = Math.max(leftCol.length, rightCol.length);
    const colWidth = Math.floor((w - 3) / 2);
    for (let i = 0; i < maxRows; i++) {
      const left = (leftCol[i] || '').padEnd(colWidth);
      const right = (rightCol[i] || '').padEnd(colWidth);
      lines.push(`${left} │ ${right}`);
    }

    lines.push('');

    // Content stats
    if (this.config.showContent) {
      lines.push(this.renderContentBox(state, w));
      lines.push('');
    }

    // Events
    if (this.config.showEvents) {
      lines.push(this.renderEventsBox(state, w));
    }

    // Footer
    lines.push('');
    lines.push(this.renderFooter(state, w));

    return lines.join('\n');
  }

  private renderHeader(w: number): string {
    const title = '╔═══ GENESIS SYSTEM MONITOR v27.0 ═══╗';
    const padding = Math.floor((w - title.length) / 2);
    return `${ANSI.bold}${ANSI.cyan}${' '.repeat(padding)}${title}${ANSI.reset}`;
  }

  private renderSystemStatus(state: MonitorState, w: number): string {
    const uptimeStr = this.formatUptime(state.uptime);
    const memStr = `${state.heapUsed}/${state.heapTotal}MB`;
    const phiColor = state.phi > 0.7 ? ANSI.green : state.phi > 0.4 ? ANSI.yellow : ANSI.red;

    return `${ANSI.dim}Uptime: ${uptimeStr} │ Memory: ${memStr} │ ${phiColor}φ: ${state.phi.toFixed(3)}${ANSI.reset}`;
  }

  private renderPhiBox(state: MonitorState): string {
    const phiBar = this.renderBar(state.phi, 15);
    const stateColor = state.phiState === 'alert' ? ANSI.green :
                       state.phiState === 'aware' ? ANSI.yellow :
                       state.phiState === 'drowsy' ? ANSI.red : ANSI.dim;

    return `${ANSI.bold}Consciousness${ANSI.reset}\n` +
           `  φ: ${phiBar} ${(state.phi * 100).toFixed(0)}%\n` +
           `  State: ${stateColor}${state.phiState}${ANSI.reset}\n` +
           `  Trend: ${state.phiTrend}`;
  }

  private renderMemoryBox(state: MonitorState): string {
    return `${ANSI.bold}Memory${ANSI.reset}\n` +
           `  Episodic:   ${state.memoryStats.episodic}\n` +
           `  Semantic:   ${state.memoryStats.semantic}\n` +
           `  Procedural: ${state.memoryStats.procedural}`;
  }

  private renderDecisionBox(state: MonitorState): string {
    const modeColor = state.decisionStats.mode === 'explore' ? ANSI.magenta :
                      state.decisionStats.mode === 'exploit' ? ANSI.green :
                      state.decisionStats.mode === 'rest' ? ANSI.yellow : ANSI.dim;
    const successBar = this.renderBar(state.decisionStats.successRate, 10);

    return `${ANSI.bold}Decisions${ANSI.reset}\n` +
           `  Total: ${state.decisionStats.total}\n` +
           `  Success: ${successBar} ${(state.decisionStats.successRate * 100).toFixed(0)}%\n` +
           `  Mode: ${modeColor}${state.decisionStats.mode}${ANSI.reset}\n` +
           `  Pending: ${state.decisionStats.pending}`;
  }

  private renderBountyBox(state: MonitorState): string {
    const revenueStr = state.bountyStats.revenue > 0 ?
      `${ANSI.green}$${state.bountyStats.revenue.toFixed(2)}${ANSI.reset}` : '$0.00';

    return `${ANSI.bold}Bounties${ANSI.reset}\n` +
           `  Active:    ${state.bountyStats.active}\n` +
           `  Completed: ${state.bountyStats.completed}\n` +
           `  Failed:    ${state.bountyStats.failed}\n` +
           `  Revenue:   ${revenueStr}`;
  }

  private renderContentBox(state: MonitorState, w: number): string {
    const platform = state.contentStats.topPlatform || 'none';
    return `${ANSI.bold}Content${ANSI.reset}: Ideas: ${state.contentStats.ideas} │ Viral: ${state.contentStats.viral} │ Top: ${platform}`;
  }

  private renderEventsBox(state: MonitorState, w: number): string {
    const lines: string[] = [`${ANSI.bold}Recent Events${ANSI.reset}`];

    for (const event of state.recentEvents.slice(0, 5)) {
      const typeColor = event.type === 'decision' ? ANSI.cyan :
                        event.type === 'bounty' ? ANSI.green :
                        event.type === 'pain' ? ANSI.red :
                        event.type === 'phi' ? ANSI.magenta : ANSI.dim;
      lines.push(`  ${ANSI.dim}${event.time}${ANSI.reset} ${typeColor}[${event.type}]${ANSI.reset} ${event.message.slice(0, 40)}`);
    }

    if (state.recentEvents.length === 0) {
      lines.push(`  ${ANSI.dim}No recent events${ANSI.reset}`);
    }

    return lines.join('\n');
  }

  private renderFooter(state: MonitorState, w: number): string {
    return `${ANSI.dim}Press Ctrl+C to exit${ANSI.reset}`;
  }

  private renderBar(value: number, width: number): string {
    const filled = Math.round(value * width);
    const empty = width - filled;
    const color = value > 0.7 ? ANSI.green : value > 0.4 ? ANSI.yellow : ANSI.red;
    return `${color}[${'█'.repeat(filled)}${'░'.repeat(empty)}]${ANSI.reset}`;
  }

  private formatUptime(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }

  // ===========================================================================
  // Control
  // ===========================================================================

  start(): void {
    if (this.running) return;
    this.running = true;
    this.startTime = Date.now();

    // Hide cursor
    process.stdout.write(ANSI.hide);

    // Initial render
    this.refresh();

    // Start refresh timer
    this.timer = setInterval(() => this.refresh(), this.config.refreshRate);

    // Handle exit
    process.on('SIGINT', () => this.stop());
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;

    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    // Show cursor
    process.stdout.write(ANSI.show);
    process.stdout.write('\n');

    console.log('Monitor stopped.');
  }

  private refresh(): void {
    const state = this.collectState();
    const output = this.render(state);

    // Clear and redraw
    process.stdout.write(ANSI.home + ANSI.clear);
    process.stdout.write(output);
  }

  /**
   * Run monitor (blocking)
   */
  async run(): Promise<void> {
    this.start();
    await new Promise<void>((resolve) => {
      process.on('SIGINT', () => {
        this.stop();
        resolve();
      });
    });
  }
}

// ============================================================================
// Singleton
// ============================================================================

let monitorInstance: SystemMonitor | null = null;

export function getSystemMonitor(config?: Partial<MonitorConfig>): SystemMonitor {
  if (!monitorInstance) {
    monitorInstance = new SystemMonitor(config);
  }
  return monitorInstance;
}

export function resetSystemMonitor(): void {
  if (monitorInstance) {
    monitorInstance.stop();
  }
  monitorInstance = null;
}

// ============================================================================
// CLI Entry Point
// ============================================================================

export async function runMonitor(config?: Partial<MonitorConfig>): Promise<void> {
  const monitor = getSystemMonitor(config);
  await monitor.run();
}
