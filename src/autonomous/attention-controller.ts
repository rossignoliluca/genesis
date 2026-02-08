/**
 * Genesis v31.0 — Attention Controller
 *
 * Manages cognitive focus across competing demands:
 * - Prioritizes stimuli based on salience, urgency, and importance
 * - Implements attention switching with hysteresis (prevents thrashing)
 * - Balances reactive (interrupt-driven) vs proactive (goal-driven) attention
 * - Tracks attention history for pattern learning
 * - Coordinates with consciousness (φ) for depth of processing
 *
 * Inspired by:
 * - Global Workspace Theory (Baars)
 * - Attention Schema Theory (Graziano)
 * - Active Inference attention as precision weighting
 *
 * @module autonomous/attention-controller
 * @version 31.0.0
 */

import { getEventBus } from '../bus/index.js';
import { getPhiMonitor } from '../consciousness/phi-monitor.js';
import { getGoalSystem, type Goal, type GoalPriority } from './goal-system.js';

// ============================================================================
// Types
// ============================================================================

export interface AttentionConfig {
  /** How often to evaluate attention (ms) */
  evaluationInterval: number;
  /** Minimum time before switching attention (ms) */
  switchCooldown: number;
  /** Weight for urgency in salience calculation */
  urgencyWeight: number;
  /** Weight for importance in salience calculation */
  importanceWeight: number;
  /** Weight for novelty in salience calculation */
  noveltyWeight: number;
  /** Maximum items in attention queue */
  maxQueueSize: number;
  /** Decay rate for salience over time */
  salienceDecay: number;
  /** Threshold below which items are dropped */
  salienceThreshold: number;
}

export type AttentionSource =
  | 'goal'           // Goal-driven (proactive)
  | 'event'          // Event-driven (reactive)
  | 'pain'           // Nociceptive signals
  | 'opportunity'    // Detected opportunities
  | 'threat'         // Detected threats
  | 'curiosity'      // Novelty-driven
  | 'routine';       // Scheduled/habitual

export type AttentionPriority = 'critical' | 'high' | 'medium' | 'low' | 'background';

export interface AttentionItem {
  id: string;
  source: AttentionSource;
  priority: AttentionPriority;
  title: string;
  description: string;

  // Salience components
  urgency: number;      // 0-1: time pressure
  importance: number;   // 0-1: strategic value
  novelty: number;      // 0-1: how new/unexpected

  // Computed
  salience: number;     // Combined score
  age: number;          // Time since created (ms)

  // Metadata
  domain?: string;
  goalId?: string;
  eventType?: string;

  // Tracking
  createdAt: Date;
  lastAccessedAt?: Date;
  accessCount: number;
  processingTime: number;  // Total ms spent on this item

  // Context
  context: Record<string, unknown>;
}

export interface AttentionFocus {
  current: AttentionItem | null;
  depth: 'shallow' | 'moderate' | 'deep';  // Based on φ level
  startedAt: Date | null;
  duration: number;
  switchCount: number;
}

export interface AttentionSwitch {
  timestamp: Date;
  from: AttentionItem | null;
  to: AttentionItem;
  reason: 'higher_salience' | 'completion' | 'timeout' | 'interrupt' | 'goal_change';
  phiLevel: number;
}

export interface AttentionStats {
  totalItems: number;
  activeItems: number;
  currentFocus: string | null;
  avgSalience: number;
  switchesLastHour: number;
  avgFocusDuration: number;
  bySource: Record<AttentionSource, number>;
  byPriority: Record<AttentionPriority, number>;
}

// ============================================================================
// Constants
// ============================================================================

const PRIORITY_MULTIPLIERS: Record<AttentionPriority, number> = {
  critical: 2.0,
  high: 1.5,
  medium: 1.0,
  low: 0.6,
  background: 0.3,
};

const DEFAULT_CONFIG: AttentionConfig = {
  evaluationInterval: 10 * 1000,  // 10 seconds
  switchCooldown: 30 * 1000,      // 30 seconds minimum focus
  urgencyWeight: 0.35,
  importanceWeight: 0.4,
  noveltyWeight: 0.25,
  maxQueueSize: 50,
  salienceDecay: 0.01,            // 1% per evaluation
  salienceThreshold: 0.1,
};

// ============================================================================
// Attention Controller
// ============================================================================

export class AttentionController {
  private config: AttentionConfig;
  private queue: Map<string, AttentionItem> = new Map();
  private focus: AttentionFocus = {
    current: null,
    depth: 'shallow',
    startedAt: null,
    duration: 0,
    switchCount: 0,
  };
  private switches: AttentionSwitch[] = [];
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private idCounter = 0;
  private lastSwitchTime = 0;

  constructor(config?: Partial<AttentionConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.setupEventListeners();
  }

  // ===========================================================================
  // Event Listening
  // ===========================================================================

  private setupEventListeners(): void {
    const bus = getEventBus();

    // High-priority interrupts from pain system
    bus.subscribePrefix('pain.', (event) => {
      const data = event as unknown as Record<string, unknown>;
      const level = data.level as string;
      if (level === 'severe' || level === 'critical') {
        this.addItem({
          source: 'pain',
          priority: 'critical',
          title: 'Pain Signal',
          description: `System experiencing ${level} pain`,
          urgency: 1.0,
          importance: 0.9,
          novelty: 0.5,
          context: data,
        });
      }
    });

    // Goal-driven attention from goal system
    bus.subscribePrefix('autonomous:goal.', (event) => {
      const topic = (event as { topic?: string }).topic || '';
      const data = event as unknown as Record<string, unknown>;

      if (topic.includes('activated')) {
        this.addItem({
          source: 'goal',
          priority: 'high',
          title: data.title as string || 'New Goal',
          description: `Goal activated: ${data.title}`,
          urgency: 0.6,
          importance: 0.8,
          novelty: 0.7,
          goalId: data.goalId as string,
          context: data,
        });
      }
    });

    // Bounty opportunities
    bus.subscribePrefix('bounty.', (event) => {
      const topic = (event as { topic?: string }).topic || '';
      const data = event as unknown as Record<string, unknown>;

      if (topic.includes('available') || topic.includes('new')) {
        this.addItem({
          source: 'opportunity',
          priority: 'medium',
          title: 'New Bounty Available',
          description: data.title as string || 'Bounty opportunity detected',
          urgency: 0.5,
          importance: 0.6,
          novelty: 0.8,
          domain: 'bounty',
          context: data,
        });
      }
    });

    // Content trends (curiosity-driven)
    bus.subscribePrefix('content.', (event) => {
      const topic = (event as { topic?: string }).topic || '';
      const data = event as unknown as Record<string, unknown>;

      if (topic.includes('trend') || topic.includes('viral')) {
        this.addItem({
          source: 'curiosity',
          priority: 'low',
          title: 'Trending Topic',
          description: data.topic as string || 'Content opportunity',
          urgency: 0.3,
          importance: 0.5,
          novelty: 0.9,
          domain: 'content',
          context: data,
        });
      }
    });

    // Strategy changes require attention shift
    bus.subscribePrefix('strategy.', (event) => {
      const topic = (event as { topic?: string }).topic || '';
      if (topic.includes('changed')) {
        const data = event as unknown as Record<string, unknown>;
        this.addItem({
          source: 'event',
          priority: 'high',
          title: 'Strategy Shift',
          description: `Strategy changed to ${data.strategy || 'new mode'}`,
          urgency: 0.7,
          importance: 0.8,
          novelty: 0.6,
          context: data,
        });
      }
    });

    // Reflection insights
    bus.subscribePrefix('autonomous:reflection.', (event) => {
      const topic = (event as { topic?: string }).topic || '';
      const data = event as unknown as Record<string, unknown>;

      if (topic.includes('completed') && (data.insights as number) > 0) {
        this.addItem({
          source: 'curiosity',
          priority: 'medium',
          title: 'Reflection Insights',
          description: `${data.insights} new insights from self-reflection`,
          urgency: 0.3,
          importance: 0.7,
          novelty: 0.8,
          domain: 'learning',
          context: data,
        });
      }
    });
  }

  // ===========================================================================
  // Item Management
  // ===========================================================================

  addItem(params: {
    source: AttentionSource;
    priority: AttentionPriority;
    title: string;
    description: string;
    urgency: number;
    importance: number;
    novelty: number;
    domain?: string;
    goalId?: string;
    eventType?: string;
    context?: Record<string, unknown>;
  }): AttentionItem {
    const id = `attn-${++this.idCounter}-${Date.now().toString(36)}`;
    const now = new Date();

    const salience = this.calculateSalience(
      params.urgency,
      params.importance,
      params.novelty,
      params.priority,
    );

    const item: AttentionItem = {
      id,
      source: params.source,
      priority: params.priority,
      title: params.title,
      description: params.description,
      urgency: params.urgency,
      importance: params.importance,
      novelty: params.novelty,
      salience,
      age: 0,
      domain: params.domain,
      goalId: params.goalId,
      eventType: params.eventType,
      createdAt: now,
      accessCount: 0,
      processingTime: 0,
      context: params.context || {},
    };

    this.queue.set(id, item);

    // Enforce queue size limit
    if (this.queue.size > this.config.maxQueueSize) {
      this.pruneQueue();
    }

    // Check if this should interrupt current focus
    if (this.shouldInterrupt(item)) {
      this.switchTo(item, 'interrupt');
    }

    this.emitEvent('attention.item.added', {
      itemId: id,
      title: item.title,
      source: item.source,
      salience: item.salience,
    });

    return item;
  }

  removeItem(itemId: string): boolean {
    const item = this.queue.get(itemId);
    if (!item) return false;

    // If currently focused, switch away
    if (this.focus.current?.id === itemId) {
      this.switchToNext('completion');
    }

    this.queue.delete(itemId);
    return true;
  }

  private pruneQueue(): void {
    // Remove items below salience threshold
    for (const [id, item] of this.queue) {
      if (item.salience < this.config.salienceThreshold) {
        this.queue.delete(id);
      }
    }

    // If still over limit, remove lowest salience
    if (this.queue.size > this.config.maxQueueSize) {
      const sorted = [...this.queue.values()].sort((a, b) => a.salience - b.salience);
      const toRemove = sorted.slice(0, this.queue.size - this.config.maxQueueSize);
      for (const item of toRemove) {
        this.queue.delete(item.id);
      }
    }
  }

  // ===========================================================================
  // Salience Calculation
  // ===========================================================================

  private calculateSalience(
    urgency: number,
    importance: number,
    novelty: number,
    priority: AttentionPriority,
  ): number {
    const base =
      urgency * this.config.urgencyWeight +
      importance * this.config.importanceWeight +
      novelty * this.config.noveltyWeight;

    return Math.min(1, base * PRIORITY_MULTIPLIERS[priority]);
  }

  private updateSalience(item: AttentionItem): void {
    // Decay salience over time
    const ageDecay = Math.pow(1 - this.config.salienceDecay, item.age / 60000);

    // Novelty decays faster with access
    const noveltyDecay = Math.pow(0.9, item.accessCount);
    const adjustedNovelty = item.novelty * noveltyDecay;

    item.salience = this.calculateSalience(
      item.urgency,
      item.importance,
      adjustedNovelty,
      item.priority,
    ) * ageDecay;
  }

  // ===========================================================================
  // Attention Switching
  // ===========================================================================

  private shouldInterrupt(newItem: AttentionItem): boolean {
    // Critical always interrupts
    if (newItem.priority === 'critical') return true;

    // Nothing focused, no interrupt needed
    if (!this.focus.current) return false;

    // Respect cooldown - non-critical items can't interrupt during cooldown
    const timeSinceSwitch = Date.now() - this.lastSwitchTime;
    if (timeSinceSwitch < this.config.switchCooldown) {
      return false;  // Already handled critical above
    }

    // Compare salience with hysteresis (need 20% higher to switch)
    return newItem.salience > this.focus.current.salience * 1.2;
  }

  private switchTo(item: AttentionItem, reason: AttentionSwitch['reason']): void {
    const now = new Date();
    const phiLevel = getPhiMonitor().getCurrentLevel()?.phi ?? 0.5;

    // Record switch
    this.switches.push({
      timestamp: now,
      from: this.focus.current,
      to: item,
      reason,
      phiLevel,
    });

    // Trim switch history
    if (this.switches.length > 100) {
      this.switches = this.switches.slice(-50);
    }

    // Update previous focus duration
    if (this.focus.current && this.focus.startedAt) {
      this.focus.current.processingTime += now.getTime() - this.focus.startedAt.getTime();
    }

    // Set new focus
    this.focus.current = item;
    this.focus.startedAt = now;
    this.focus.switchCount++;
    this.focus.depth = this.calculateDepth(phiLevel);

    // Update item access
    item.lastAccessedAt = now;
    item.accessCount++;

    this.lastSwitchTime = now.getTime();

    this.emitEvent('attention.switched', {
      itemId: item.id,
      title: item.title,
      reason,
      depth: this.focus.depth,
      phiLevel,
    });
  }

  private switchToNext(reason: AttentionSwitch['reason']): void {
    const next = this.getHighestSalience();
    if (next) {
      this.switchTo(next, reason);
    } else {
      // Nothing to focus on
      if (this.focus.current && this.focus.startedAt) {
        this.focus.current.processingTime +=
          Date.now() - this.focus.startedAt.getTime();
      }
      this.focus.current = null;
      this.focus.startedAt = null;
    }
  }

  private getHighestSalience(): AttentionItem | null {
    let highest: AttentionItem | null = null;
    let maxSalience = -1;

    for (const item of this.queue.values()) {
      if (item.salience > maxSalience) {
        maxSalience = item.salience;
        highest = item;
      }
    }

    return highest;
  }

  private calculateDepth(phi: number): 'shallow' | 'moderate' | 'deep' {
    if (phi > 0.7) return 'deep';
    if (phi > 0.4) return 'moderate';
    return 'shallow';
  }

  // ===========================================================================
  // Evaluation Loop
  // ===========================================================================

  private evaluate(): void {
    const now = Date.now();

    // Update ages and saliences
    for (const item of this.queue.values()) {
      item.age = now - item.createdAt.getTime();
      this.updateSalience(item);
    }

    // Prune low-salience items
    this.pruneQueue();

    // Update focus duration
    if (this.focus.startedAt) {
      this.focus.duration = now - this.focus.startedAt.getTime();
    }

    // Check if we should switch (outside of cooldown)
    const timeSinceSwitch = now - this.lastSwitchTime;
    if (timeSinceSwitch >= this.config.switchCooldown) {
      const highest = this.getHighestSalience();

      if (highest && this.focus.current) {
        // Switch if highest is significantly more salient
        if (highest.id !== this.focus.current.id &&
            highest.salience > this.focus.current.salience * 1.2) {
          this.switchTo(highest, 'higher_salience');
        }
      } else if (highest && !this.focus.current) {
        // Nothing focused, focus on highest
        this.switchTo(highest, 'goal_change');
      }
    }

    // Sync with goals if available
    this.syncWithGoals();
  }

  private syncWithGoals(): void {
    try {
      const goalSystem = getGoalSystem();
      const activeGoals = goalSystem.getActiveGoals();

      // Ensure active goals have attention items
      for (const goal of activeGoals) {
        const existingItem = [...this.queue.values()].find(
          item => item.goalId === goal.id
        );

        if (!existingItem) {
          this.addItem({
            source: 'goal',
            priority: this.goalPriorityToAttention(goal.priority),
            title: goal.title,
            description: goal.description,
            urgency: goal.urgency,
            importance: goal.importance,
            novelty: 0.3,  // Goals are known, not novel
            goalId: goal.id,
            domain: goal.domain,
            context: { progress: goal.metrics.progress },
          });
        } else {
          // Update existing item's urgency/importance from goal
          existingItem.urgency = goal.urgency;
          existingItem.importance = goal.importance;
          existingItem.context.progress = goal.metrics.progress;
          this.updateSalience(existingItem);
        }
      }
    } catch {
      // Goal system not available
    }
  }

  private goalPriorityToAttention(goalPriority: GoalPriority): AttentionPriority {
    switch (goalPriority) {
      case 'critical': return 'critical';
      case 'high': return 'high';
      case 'medium': return 'medium';
      case 'low': return 'low';
      default: return 'background';
    }
  }

  // ===========================================================================
  // Focus Management
  // ===========================================================================

  /**
   * Mark current focus as complete and move to next
   */
  completeFocus(): void {
    if (this.focus.current) {
      this.removeItem(this.focus.current.id);
    }
  }

  /**
   * Pause current focus (keep in queue) and move to next
   */
  pauseFocus(): void {
    this.switchToNext('timeout');
  }

  /**
   * Force focus on a specific item
   */
  forceFocus(itemId: string): boolean {
    const item = this.queue.get(itemId);
    if (!item) return false;

    this.switchTo(item, 'goal_change');
    return true;
  }

  /**
   * Get current focus
   */
  getFocus(): AttentionFocus {
    return { ...this.focus };
  }

  // ===========================================================================
  // Utilities
  // ===========================================================================

  private emitEvent(topic: string, data: Record<string, unknown>): void {
    const bus = getEventBus();
    (bus as unknown as { publish: (topic: string, event: Record<string, unknown>) => void }).publish(
      `autonomous:${topic}`,
      { precision: 0.9, ...data }
    );
  }

  // ===========================================================================
  // Control
  // ===========================================================================

  start(): void {
    if (this.running) return;
    this.running = true;

    this.timer = setInterval(() => {
      this.evaluate();
    }, this.config.evaluationInterval);

    console.log('[AttentionController] Started — cognitive focus management active');
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;

    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  // ===========================================================================
  // Getters
  // ===========================================================================

  getQueue(): AttentionItem[] {
    return [...this.queue.values()].sort((a, b) => b.salience - a.salience);
  }

  getItem(itemId: string): AttentionItem | undefined {
    return this.queue.get(itemId);
  }

  getRecentSwitches(limit = 10): AttentionSwitch[] {
    return this.switches.slice(-limit);
  }

  getStats(): AttentionStats {
    const items = [...this.queue.values()];
    const now = Date.now();
    const hourAgo = now - 60 * 60 * 1000;

    const recentSwitches = this.switches.filter(
      s => s.timestamp.getTime() > hourAgo
    );

    // Calculate average focus duration from switches
    let totalDuration = 0;
    let durationCount = 0;
    for (let i = 1; i < this.switches.length; i++) {
      const duration = this.switches[i].timestamp.getTime() -
                       this.switches[i - 1].timestamp.getTime();
      if (duration > 0 && duration < 3600000) {  // Ignore gaps > 1 hour
        totalDuration += duration;
        durationCount++;
      }
    }

    const bySource: Record<AttentionSource, number> = {
      goal: 0,
      event: 0,
      pain: 0,
      opportunity: 0,
      threat: 0,
      curiosity: 0,
      routine: 0,
    };

    const byPriority: Record<AttentionPriority, number> = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      background: 0,
    };

    for (const item of items) {
      bySource[item.source]++;
      byPriority[item.priority]++;
    }

    return {
      totalItems: items.length,
      activeItems: items.filter(i => i.salience >= this.config.salienceThreshold).length,
      currentFocus: this.focus.current?.title || null,
      avgSalience: items.length > 0
        ? items.reduce((s, i) => s + i.salience, 0) / items.length
        : 0,
      switchesLastHour: recentSwitches.length,
      avgFocusDuration: durationCount > 0 ? totalDuration / durationCount : 0,
      bySource,
      byPriority,
    };
  }

  /**
   * Get attention recommendations based on current state
   */
  getRecommendations(): Array<{
    action: string;
    reason: string;
    itemId?: string;
  }> {
    const recommendations: Array<{
      action: string;
      reason: string;
      itemId?: string;
    }> = [];

    const stats = this.getStats();

    // Too many switches = attention fragmentation
    if (stats.switchesLastHour > 20) {
      recommendations.push({
        action: 'increase_cooldown',
        reason: 'High switch rate indicates attention fragmentation',
      });
    }

    // Critical items not focused
    const criticalItems = [...this.queue.values()].filter(
      i => i.priority === 'critical'
    );
    for (const item of criticalItems) {
      if (this.focus.current?.id !== item.id) {
        recommendations.push({
          action: 'focus_critical',
          reason: `Critical item "${item.title}" needs immediate attention`,
          itemId: item.id,
        });
      }
    }

    // Stale focus
    if (this.focus.duration > 5 * 60 * 1000) {  // > 5 minutes
      recommendations.push({
        action: 'check_progress',
        reason: 'Long focus duration, verify progress is being made',
        itemId: this.focus.current?.id,
      });
    }

    // No focus when items available
    if (!this.focus.current && this.queue.size > 0) {
      const highest = this.getHighestSalience();
      if (highest) {
        recommendations.push({
          action: 'establish_focus',
          reason: 'No current focus, should attend to highest priority',
          itemId: highest.id,
        });
      }
    }

    return recommendations;
  }
}

// ============================================================================
// Singleton
// ============================================================================

let attentionInstance: AttentionController | null = null;

export function getAttentionController(config?: Partial<AttentionConfig>): AttentionController {
  if (!attentionInstance) {
    attentionInstance = new AttentionController(config);
  }
  return attentionInstance;
}

export function resetAttentionController(): void {
  if (attentionInstance) {
    attentionInstance.stop();
  }
  attentionInstance = null;
}
