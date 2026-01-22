/**
 * Genesis 4.0 - Message Bus
 *
 * Pub/Sub message bus for agent communication.
 * Based on EventEmitter pattern with typed messages.
 */

import { Message, MessageType, MessagePriority, AgentId } from './types.js';
import { randomUUID } from 'crypto';

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

  // Metrics
  private metrics = {
    messagesSent: 0,
    messagesDelivered: 0,
    messagesDropped: 0,
    startTime: new Date(),
  };

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

    // Store in history
    this.addToHistory(fullMessage);

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
}

// ============================================================================
// Singleton Export
// ============================================================================

export const messageBus = new MessageBus();

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
