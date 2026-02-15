/**
 * Genesis 4.0 - Message Bus
 *
 * Pub/Sub message bus for agent communication.
 * Based on EventEmitter pattern with typed messages.
 */

import { Message, MessageType, MessagePriority, AgentId } from './types.js';
import { randomUUID } from 'crypto';
import { appendFileSync, mkdirSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';

// ============================================================================
// Persistent Message Log
// ============================================================================

export interface PersistenceConfig {
  /** Enable persistent logging */
  enabled: boolean;
  /** Directory for log files */
  logDir: string;
  /** Max file size before rotation (bytes) */
  maxFileSize: number;
  /** Flush interval for batch writes (ms). 0 = synchronous writes */
  flushInterval: number;
}

const DEFAULT_PERSISTENCE_CONFIG: PersistenceConfig = {
  enabled: false,
  logDir: '.genesis/message-logs',
  maxFileSize: 50 * 1024 * 1024, // 50MB
  flushInterval: 0,              // Sync writes for safety
};

/**
 * Append-only JSONL log for message audit trail.
 * Survives restarts. Supports replay for debugging and recovery.
 */
export class PersistentMessageLog {
  private config: PersistenceConfig;
  private currentFile: string;
  private buffer: string[] = [];
  private flushTimer: NodeJS.Timeout | null = null;
  private fileIndex = 0;

  constructor(config: Partial<PersistenceConfig> = {}) {
    this.config = { ...DEFAULT_PERSISTENCE_CONFIG, ...config };
    this.currentFile = '';

    if (this.config.enabled) {
      this.init();
    }
  }

  private init(): void {
    if (!existsSync(this.config.logDir)) {
      mkdirSync(this.config.logDir, { recursive: true });
    }
    this.currentFile = this.getLogFilePath();

    if (this.config.flushInterval > 0) {
      this.flushTimer = setInterval(() => this.flush(), this.config.flushInterval);
    }
  }

  private getLogFilePath(): string {
    const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    return join(this.config.logDir, `messages-${date}-${this.fileIndex}.jsonl`);
  }

  /** Append a message to the persistent log */
  append(message: Message): void {
    if (!this.config.enabled) return;

    const line = JSON.stringify({
      id: message.id,
      type: message.type,
      from: message.from,
      to: message.to,
      priority: message.priority,
      timestamp: message.timestamp,
      replyTo: message.replyTo,
      correlationId: message.correlationId,
      payloadSize: JSON.stringify(message.payload).length,
      // Store payload summary (not full payload to limit log size)
      payloadType: typeof message.payload,
      payloadKeys: message.payload && typeof message.payload === 'object'
        ? Object.keys(message.payload)
        : undefined,
    }) + '\n';

    if (this.config.flushInterval > 0) {
      this.buffer.push(line);
    } else {
      this.writeSync(line);
    }
  }

  /** Append full message including payload (for critical messages) */
  appendFull(message: Message): void {
    if (!this.config.enabled) return;

    const line = JSON.stringify({
      ...message,
      timestamp: message.timestamp,
    }) + '\n';

    this.writeSync(line);
  }

  private writeSync(line: string): void {
    try {
      // Rotate if needed
      if (existsSync(this.currentFile)) {
        const stats = readFileSync(this.currentFile);
        if (stats.length >= this.config.maxFileSize) {
          this.fileIndex++;
          this.currentFile = this.getLogFilePath();
        }
      }
      appendFileSync(this.currentFile, line, 'utf8');
    } catch (err) {
      // Silent fail — don't crash the system for logging
      console.error('[MessageBus] Log write failed:', err);
    }
  }

  /** Flush buffered writes */
  flush(): void {
    if (this.buffer.length === 0) return;
    const data = this.buffer.join('');
    this.buffer = [];
    this.writeSync(data);
  }

  /** Replay messages from log files (for recovery/debugging) */
  replay(options?: {
    since?: Date;
    until?: Date;
    type?: MessageType;
    from?: AgentId;
    limit?: number;
  }): Array<Record<string, unknown>> {
    if (!this.config.enabled || !existsSync(this.currentFile)) return [];

    const results: Array<Record<string, unknown>> = [];
    try {
      const content = readFileSync(this.currentFile, 'utf8');
      const lines = content.trim().split('\n').filter(Boolean);

      for (const line of lines) {
        const entry = JSON.parse(line) as Record<string, unknown>;
        const ts = new Date(entry.timestamp as string);

        if (options?.since && ts < options.since) continue;
        if (options?.until && ts > options.until) continue;
        if (options?.type && entry.type !== options.type) continue;
        if (options?.from && entry.from !== options.from) continue;

        results.push(entry);
        if (options?.limit && results.length >= options.limit) break;
      }
    } catch (err) {
      // File read error
      console.error('[MessageBus] Log read failed:', err);
    }

    return results;
  }

  /** Get log file stats */
  getStats(): { enabled: boolean; currentFile: string; bufferSize: number } {
    return {
      enabled: this.config.enabled,
      currentFile: this.currentFile,
      bufferSize: this.buffer.length,
    };
  }

  shutdown(): void {
    this.flush();
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }
}

// ============================================================================
// Message Bus Types
// ============================================================================

export type MessageHandler = (message: Message) => void | Promise<void>;

export interface Subscription {
  id: string;
  agentId: AgentId;
  filter?: MessageFilter;
  handler: MessageHandler;
}

export interface MessageFilter {
  types?: MessageType[];
  from?: AgentId[];
  priority?: MessagePriority[];
}

// ============================================================================
// Message Bus Class
// ============================================================================

export class MessageBus {
  private subscriptions: Map<string, Subscription> = new Map();
  // v10.3: Priority queues instead of O(n log n) sort
  private priorityQueues: Record<MessagePriority, Message[]> = {
    critical: [],
    high: [],
    normal: [],
    low: [],
  };
  private processing = false;
  private messageHistory: Message[] = [];
  private maxHistorySize = 1000;

  // v18.1: Persistent message log for audit trail
  readonly persistentLog: PersistentMessageLog;

  // Metrics
  private metrics = {
    messagesSent: 0,
    messagesDelivered: 0,
    messagesDropped: 0,
    startTime: new Date(),
  };

  constructor(persistenceConfig?: Partial<PersistenceConfig>) {
    this.persistentLog = new PersistentMessageLog(persistenceConfig);
  }

  // ============================================================================
  // Core Methods
  // ============================================================================

  /**
   * Subscribe to messages
   */
  subscribe(
    agentId: AgentId,
    handler: MessageHandler,
    filter?: MessageFilter
  ): string {
    const subscriptionId = randomUUID();
    this.subscriptions.set(subscriptionId, {
      id: subscriptionId,
      agentId,
      filter,
      handler,
    });
    return subscriptionId;
  }

  /**
   * Unsubscribe from messages
   */
  unsubscribe(subscriptionId: string): boolean {
    return this.subscriptions.delete(subscriptionId);
  }

  /**
   * Publish a message
   */
  async publish(message: Omit<Message, 'id' | 'timestamp'>): Promise<string> {
    const fullMessage: Message = {
      ...message,
      id: randomUUID(),
      timestamp: new Date(),
    };

    // v10.3: O(1) insertion into priority queue
    const priority = fullMessage.priority || 'normal';
    this.priorityQueues[priority].push(fullMessage);
    this.metrics.messagesSent++;

    // Store in history (in-memory hot path)
    this.addToHistory(fullMessage);

    // v18.1: Persistent log (cold storage audit trail)
    if (priority === 'critical') {
      this.persistentLog.appendFull(fullMessage); // Full payload for critical
    } else {
      this.persistentLog.append(fullMessage);     // Summary for others
    }

    // Process queue
    await this.processQueue();

    return fullMessage.id;
  }

  /**
   * Create and publish a message (helper)
   */
  async send(
    from: AgentId,
    to: AgentId | 'broadcast' | 'kernel',
    type: MessageType,
    payload: any,
    options: {
      priority?: MessagePriority;
      replyTo?: string;
      correlationId?: string;
    } = {}
  ): Promise<string> {
    return this.publish({
      from,
      to,
      type,
      payload,
      priority: options.priority || 'normal',
      replyTo: options.replyTo,
      correlationId: options.correlationId,
    });
  }

  /**
   * Broadcast to all agents
   */
  async broadcast(
    from: AgentId,
    type: MessageType,
    payload: any,
    priority: MessagePriority = 'normal'
  ): Promise<string> {
    return this.send(from, 'broadcast', type, payload, { priority });
  }

  // ============================================================================
  // Queue Processing
  // ============================================================================

  private async processQueue(): Promise<void> {
    if (this.processing) return;
    this.processing = true;

    try {
      // v10.3: O(1) extraction from priority queues (no sorting needed)
      const priorities: MessagePriority[] = ['critical', 'high', 'normal', 'low'];

      for (const priority of priorities) {
        while (this.priorityQueues[priority].length > 0) {
          const message = this.priorityQueues[priority].shift()!;
          await this.deliverMessage(message);
        }
      }
    } finally {
      this.processing = false;
    }
  }

  private async deliverMessage(message: Message): Promise<void> {
    const targetSubscriptions = this.findSubscriptions(message);

    if (targetSubscriptions.length === 0) {
      this.metrics.messagesDropped++;
      return;
    }

    // Deliver to all matching subscriptions
    const deliveryPromises = targetSubscriptions.map(async (sub) => {
      try {
        await sub.handler(message);
        this.metrics.messagesDelivered++;
      } catch (error) {
        console.error(`[MessageBus] Error delivering to ${sub.agentId}:`, error);
      }
    });

    await Promise.all(deliveryPromises);
  }

  private findSubscriptions(message: Message): Subscription[] {
    const matching: Subscription[] = [];

    for (const sub of this.subscriptions.values()) {
      // Check if message is for this subscriber
      if (message.to !== 'broadcast') {
        // Exact match by ID
        const exactMatch = message.to === sub.agentId;
        // Match by agent type (e.g., 'explorer' matches 'explorer-12345678')
        const typeMatch = sub.agentId.startsWith(message.to + '-');

        if (!exactMatch && !typeMatch) {
          continue;
        }
      }

      // Check filter
      if (sub.filter) {
        if (sub.filter.types && !sub.filter.types.includes(message.type)) {
          continue;
        }
        if (sub.filter.from && !sub.filter.from.includes(message.from)) {
          continue;
        }
        if (sub.filter.priority && !sub.filter.priority.includes(message.priority)) {
          continue;
        }
      }

      matching.push(sub);
    }

    return matching;
  }

  // ============================================================================
  // History
  // ============================================================================

  private addToHistory(message: Message): void {
    this.messageHistory.push(message);
    if (this.messageHistory.length > this.maxHistorySize) {
      this.messageHistory.shift();
    }
  }

  getHistory(filter?: {
    from?: AgentId;
    to?: AgentId;
    type?: MessageType;
    limit?: number;
  }): Message[] {
    let filtered = [...this.messageHistory];

    if (filter?.from) {
      filtered = filtered.filter((m) => m.from === filter.from);
    }
    if (filter?.to) {
      filtered = filtered.filter((m) => m.to === filter.to);
    }
    if (filter?.type) {
      filtered = filtered.filter((m) => m.type === filter.type);
    }

    if (filter?.limit) {
      filtered = filtered.slice(-filter.limit);
    }

    return filtered;
  }

  // ============================================================================
  // Utilities
  // ============================================================================

  /**
   * Wait for a specific message (useful for request-response)
   */
  waitForMessage(
    filter: {
      replyTo?: string;
      correlationId?: string;
      type?: MessageType;
      from?: AgentId;
      to?: AgentId;  // The expected recipient
    },
    timeout = 30000
  ): Promise<Message> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.unsubscribe(subId);
        reject(new Error('Message timeout'));
      }, timeout);

      // Subscribe using the expected recipient ID so we receive messages addressed to them
      const subscriberId = filter.to || 'waiter-' + randomUUID();

      const subId = this.subscribe(
        subscriberId,
        (message) => {
          let matches = true;
          if (filter.replyTo && message.replyTo !== filter.replyTo) matches = false;
          if (filter.correlationId && message.correlationId !== filter.correlationId) matches = false;
          if (filter.type && message.type !== filter.type) matches = false;
          if (filter.from && !message.from.startsWith(filter.from)) matches = false;

          if (matches) {
            clearTimeout(timeoutId);
            this.unsubscribe(subId);
            resolve(message);
          }
        }
      );
    });
  }

  /**
   * Request-response pattern
   */
  async request(
    from: AgentId,
    to: AgentId,
    type: MessageType,
    payload: any,
    timeout = 30000
  ): Promise<Message> {
    const correlationId = randomUUID();

    // Set up response listener first
    // We subscribe as 'from' to receive responses addressed to us
    const responsePromise = this.waitForMessage(
      { correlationId, from: to, to: from },
      timeout
    );

    // Send request
    await this.send(from, to, type, payload, { correlationId });

    // Wait for response
    return responsePromise;
  }

  // ============================================================================
  // Metrics
  // ============================================================================

  getMetrics() {
    // v10.3: Sum all priority queues for total queue length
    const queueLength = Object.values(this.priorityQueues).reduce((sum, q) => sum + q.length, 0);
    return {
      ...this.metrics,
      uptime: Date.now() - this.metrics.startTime.getTime(),
      activeSubscriptions: this.subscriptions.size,
      queueLength,
      historySize: this.messageHistory.length,
    };
  }

  // ============================================================================
  // Cleanup
  // ============================================================================

  clear(): void {
    this.subscriptions.clear();
    // v10.3: Clear all priority queues
    this.priorityQueues = { critical: [], high: [], normal: [], low: [] };
    this.messageHistory = [];
  }

  /**
   * v18.1: Replay messages from persistent log
   */
  replay(options?: Parameters<PersistentMessageLog['replay']>[0]) {
    return this.persistentLog.replay(options);
  }

  /**
   * v18.1: Enable persistent logging after construction
   */
  enablePersistence(config: Partial<PersistenceConfig>): void {
    const newLog = new PersistentMessageLog({ ...config, enabled: true });
    // @ts-expect-error: overwriting readonly for reconfiguration
    this.persistentLog = newLog;
  }

  /**
   * v18.1: Graceful shutdown
   */
  shutdown(): void {
    this.persistentLog.shutdown();
    this.clear();
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

export const messageBus = new MessageBus({
  enabled: !!process.env.GENESIS_MESSAGE_PERSISTENCE,
  logDir: process.env.GENESIS_MESSAGE_LOG_DIR || '.genesis/message-logs',
});

// ============================================================================
// Helper Functions
// ============================================================================

export function createMessage(
  from: AgentId,
  to: AgentId | 'broadcast' | 'kernel',
  type: MessageType,
  payload: any,
  options: Partial<Message> = {}
): Message {
  return {
    id: randomUUID(),
    from,
    to,
    type,
    payload,
    timestamp: new Date(),
    priority: options.priority || 'normal',
    replyTo: options.replyTo,
    correlationId: options.correlationId,
  };
}
