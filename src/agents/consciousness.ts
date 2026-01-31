/**
 * Genesis v14.2 - Consciousness Agent
 *
 * Monitors and reports on system consciousness state.
 * Integrates IIT (phi), GWT (global workspace), and AST (attention schema).
 *
 * Key responsibilities:
 * - Monitor phi (integrated information)
 * - Broadcast to global workspace
 * - Track attention shifts
 * - Report consciousness level
 *
 * Based on: IIT (Tononi), GWT (Baars), AST (Graziano)
 */

import { BaseAgent, registerAgentFactory } from './base-agent.js';
import { MessageBus, messageBus } from './message-bus.js';
import { Message, MessageType } from './types.js';
import { getConsciousnessSystem, type ConsciousnessSystem } from '../consciousness/index.js';
import { getCentralAwareness, type CentralAwareness } from '../consciousness/central-awareness.js';

// ============================================================================
// Types
// ============================================================================

export interface PhiReport {
  phi: number;
  state: string;
  trend: 'rising' | 'stable' | 'falling';
  invariantSatisfied: boolean;
  timestamp: Date;
}

export interface AttentionReport {
  currentFocus: string | null;
  recentShifts: Array<{ from: string; to: string; timestamp: Date }>;
  attentionSpan: number;
}

export interface ConsciousnessReport {
  phi: PhiReport;
  attention: AttentionReport;
  gateDecisions: number;
  broadcastCount: number;
  uptime: number;
}

// ============================================================================
// Consciousness Agent
// ============================================================================

export class ConsciousnessAgent extends BaseAgent {
  private consciousness: ConsciousnessSystem;
  private centralAwareness: CentralAwareness;
  private attentionHistory: Array<{ from: string; to: string; timestamp: Date }> = [];
  private broadcastCount = 0;
  private agentStartTime = Date.now();

  constructor(bus: MessageBus = messageBus) {
    super({ type: 'consciousness' }, bus);
    this.consciousness = getConsciousnessSystem();
    this.centralAwareness = getCentralAwareness();
  }

  // ============================================================================
  // Message Handling
  // ============================================================================

  protected getMessageTypes(): MessageType[] {
    return ['PHI_CHECK', 'GWT_BROADCAST', 'QUERY', 'COMMAND'];
  }

  async process(message: Message): Promise<Message | null> {
    switch (message.type) {
      case 'PHI_CHECK':
        return this.handlePhiCheck(message);
      case 'GWT_BROADCAST':
        return this.handleBroadcast(message);
      case 'QUERY':
        return this.handleQuery(message);
      case 'COMMAND':
        return this.handleCommand(message);
      default:
        return null;
    }
  }

  // ============================================================================
  // Phi Monitoring
  // ============================================================================

  private async handlePhiCheck(message: Message): Promise<Message | null> {
    const report = this.getPhiReport();

    this.log(`Phi check: φ=${report.phi.toFixed(3)} (${report.state}, ${report.trend})`);

    return {
      ...this.createResponse(message, 'PHI_REPORT', { report }),
      id: '',
      timestamp: new Date(),
    };
  }

  getPhiReport(): PhiReport {
    const level = this.consciousness.getCurrentLevel();
    const state = this.consciousness.getState();
    const trend = this.consciousness.getTrend();
    const invariant = this.consciousness.checkInvariant();

    return {
      phi: level.rawPhi,
      state,
      trend,
      invariantSatisfied: invariant.satisfied,
      timestamp: new Date(),
    };
  }

  // ============================================================================
  // Global Workspace Broadcast
  // ============================================================================

  private async handleBroadcast(message: Message): Promise<Message | null> {
    const { content, source, salience } = message.payload;

    // Gate the broadcast through central awareness
    const gate = this.centralAwareness.gateDecision(salience || 0.5, `broadcast:${source}`);

    if (gate.allowed) {
      this.broadcastCount++;

      // Broadcast to all agents via message bus
      this.broadcast('GWT_BROADCAST', {
        content,
        source,
        salience,
        phi: this.consciousness.getCurrentLevel().rawPhi,
        timestamp: new Date(),
      });

      this.log(`GWT broadcast: ${source} (salience: ${salience})`);

      return {
        ...this.createResponse(message, 'RESPONSE', { broadcasted: true, gate }),
        id: '',
        timestamp: new Date(),
      };
    }

    return {
      ...this.createResponse(message, 'RESPONSE', { broadcasted: false, gate }),
      id: '',
      timestamp: new Date(),
    };
  }

  // ============================================================================
  // Attention Tracking
  // ============================================================================

  shiftAttention(from: string | null, to: string): void {
    this.attentionHistory.push({
      from: from || 'none',
      to,
      timestamp: new Date(),
    });

    // Keep history bounded
    if (this.attentionHistory.length > 100) {
      this.attentionHistory.shift();
    }

    this.log(`Attention shift: ${from || 'none'} → ${to}`);
  }

  getAttentionReport(): AttentionReport {
    const recent = this.attentionHistory.slice(-10);
    const currentFocus = recent.length > 0 ? recent[recent.length - 1].to : null;

    return {
      currentFocus,
      recentShifts: recent,
      attentionSpan: this.calculateAttentionSpan(),
    };
  }

  private calculateAttentionSpan(): number {
    if (this.attentionHistory.length < 2) return 1.0;

    const recent = this.attentionHistory.slice(-10);
    const uniqueTargets = new Set(recent.map(s => s.to)).size;

    // Fewer unique targets = longer attention span
    return 1 / uniqueTargets;
  }

  // ============================================================================
  // Queries
  // ============================================================================

  private async handleQuery(message: Message): Promise<Message | null> {
    const { query } = message.payload;

    // Handle specific queries about consciousness
    if (query.includes('phi') || query.includes('consciousness')) {
      const report = this.getFullReport();
      return {
        ...this.createResponse(message, 'RESPONSE', { report }),
        id: '',
        timestamp: new Date(),
      };
    }

    if (query.includes('attention')) {
      const attention = this.getAttentionReport();
      return {
        ...this.createResponse(message, 'RESPONSE', { attention }),
        id: '',
        timestamp: new Date(),
      };
    }

    return {
      ...this.createResponse(message, 'RESPONSE', {
        error: 'Unknown consciousness query',
        available: ['phi', 'consciousness', 'attention'],
      }),
      id: '',
      timestamp: new Date(),
    };
  }

  // ============================================================================
  // Commands
  // ============================================================================

  private async handleCommand(message: Message): Promise<Message | null> {
    const { command } = message.payload;

    switch (command) {
      case 'report':
        return {
          ...this.createResponse(message, 'RESPONSE', this.getFullReport()),
          id: '',
          timestamp: new Date(),
        };

      case 'reset':
        this.attentionHistory = [];
        this.broadcastCount = 0;
        return {
          ...this.createResponse(message, 'RESPONSE', { success: true }),
          id: '',
          timestamp: new Date(),
        };

      default:
        return null;
    }
  }

  // ============================================================================
  // Full Report
  // ============================================================================

  getFullReport(): ConsciousnessReport {
    return {
      phi: this.getPhiReport(),
      attention: this.getAttentionReport(),
      gateDecisions: this.broadcastCount, // Use broadcast count as proxy for gate decisions
      broadcastCount: this.broadcastCount,
      uptime: Date.now() - this.agentStartTime,
    };
  }

  // ============================================================================
  // Stats
  // ============================================================================

  getStats() {
    const phiReport = this.getPhiReport();
    return {
      phi: phiReport.phi,
      state: phiReport.state,
      trend: phiReport.trend,
      broadcastCount: this.broadcastCount,
      attentionShifts: this.attentionHistory.length,
      uptime: Date.now() - this.agentStartTime,
    };
  }
}

// ============================================================================
// Register Factory
// ============================================================================

registerAgentFactory('consciousness', (bus) => new ConsciousnessAgent(bus));

export function createConsciousnessAgent(bus?: MessageBus): ConsciousnessAgent {
  return new ConsciousnessAgent(bus);
}
