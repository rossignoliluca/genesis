/**
 * Genesis 4.0 - Base Agent
 *
 * Abstract base class for all agents.
 * Provides common functionality and lifecycle management.
 */

import {
  Agent,
  AgentType,
  AgentState,
  AgentId,
  AgentConfig,
  Message,
  MessageType,
  HealthStatus,
} from './types.js';
import { MessageBus, messageBus } from './message-bus.js';
import { randomUUID } from 'crypto';

// ============================================================================
// Base Agent Class
// ============================================================================

export abstract class BaseAgent implements Agent {
  readonly id: AgentId;
  readonly type: AgentType;
  state: AgentState = 'idle';

  // Alias for type (for easier access in registry)
  get agentType(): AgentType {
    return this.type;
  }

  protected bus: MessageBus;
  protected subscriptionId: string | null = null;
  protected startTime: Date;
  protected messagesProcessed = 0;
  protected errors = 0;
  protected lastActivity: Date;

  // Configuration
  protected maxConcurrent: number;
  protected timeout: number;
  protected currentTasks = 0;

  constructor(config: AgentConfig, bus: MessageBus = messageBus) {
    this.id = config.id || `${config.type}-${randomUUID().slice(0, 8)}`;
    this.type = config.type;
    this.bus = bus;
    this.maxConcurrent = config.maxConcurrent || 1;
    this.timeout = config.timeout || 30000;
    this.startTime = new Date();
    this.lastActivity = new Date();
  }

  // ============================================================================
  // Lifecycle
  // ============================================================================

  wake(): void {
    if (this.state === 'sleeping' || this.state === 'idle') {
      this.state = 'idle';
      this.subscriptionId = this.bus.subscribe(
        this.id,
        this.handleMessage.bind(this),
        { types: this.getMessageTypes() }
      );
      this.log('Woke up');
    }
  }

  sleep(): void {
    if (this.subscriptionId) {
      this.bus.unsubscribe(this.subscriptionId);
      this.subscriptionId = null;
    }
    this.state = 'sleeping';
    this.log('Went to sleep');
  }

  shutdown(): void {
    this.sleep();
    this.log('Shutdown');
  }

  // ============================================================================
  // Message Handling
  // ============================================================================

  private async handleMessage(message: Message): Promise<void> {
    // Skip if at capacity
    if (this.currentTasks >= this.maxConcurrent) {
      this.log(`At capacity, queuing message ${message.id}`);
      return;
    }

    this.currentTasks++;
    this.lastActivity = new Date();

    try {
      this.state = 'working';
      const response = await this.process(message);

      if (response) {
        await this.bus.publish(response);
      }

      this.messagesProcessed++;
    } catch (error) {
      this.errors++;
      this.state = 'error';
      this.log(`Error processing message: ${error}`);

      // Send error response
      await this.sendError(message, error);
    } finally {
      this.currentTasks--;
      if (this.currentTasks === 0) {
        this.state = 'idle';
      }
    }
  }

  /**
   * Process a message - implemented by each agent
   */
  abstract process(message: Message): Promise<Message | null>;

  /**
   * Get message types this agent handles
   */
  protected abstract getMessageTypes(): MessageType[];

  // ============================================================================
  // Communication Helpers
  // ============================================================================

  protected async send(
    to: AgentId | 'broadcast' | 'kernel',
    type: MessageType,
    payload: any,
    options: { replyTo?: string; correlationId?: string } = {}
  ): Promise<string> {
    return this.bus.send(this.id, to, type, payload, {
      ...options,
      priority: 'normal',
    });
  }

  protected async broadcast(type: MessageType, payload: any): Promise<string> {
    return this.bus.broadcast(this.id, type, payload);
  }

  protected async reply(
    originalMessage: Message,
    type: MessageType,
    payload: any
  ): Promise<string> {
    return this.send(originalMessage.from, type, payload, {
      replyTo: originalMessage.id,
      correlationId: originalMessage.correlationId,
    });
  }

  protected async sendError(
    originalMessage: Message,
    error: unknown
  ): Promise<string> {
    return this.reply(originalMessage, 'ERROR', {
      error: error instanceof Error ? error.message : String(error),
      originalMessageId: originalMessage.id,
    });
  }

  protected createResponse(
    originalMessage: Message,
    type: MessageType,
    payload: any
  ): Omit<Message, 'id' | 'timestamp'> {
    return {
      from: this.id,
      to: originalMessage.from,
      type,
      payload,
      priority: 'normal',
      replyTo: originalMessage.id,
      correlationId: originalMessage.correlationId,
    };
  }

  // ============================================================================
  // Health
  // ============================================================================

  health(): HealthStatus {
    return {
      agentId: this.id,
      state: this.state,
      uptime: Date.now() - this.startTime.getTime(),
      messagesProcessed: this.messagesProcessed,
      errors: this.errors,
      lastActivity: this.lastActivity,
    };
  }

  // ============================================================================
  // Logging
  // ============================================================================

  protected log(message: string): void {
    console.log(`[${this.type}:${this.id.slice(-8)}] ${message}`);
  }

  protected logDebug(message: string): void {
    if (process.env.DEBUG) {
      console.log(`[${this.type}:${this.id.slice(-8)}] DEBUG: ${message}`);
    }
  }
}

// ============================================================================
// Agent Factory
// ============================================================================

export type AgentFactory = (bus?: MessageBus) => BaseAgent;

export const agentFactories = new Map<AgentType, AgentFactory>();

export function registerAgentFactory(type: AgentType, factory: AgentFactory): void {
  agentFactories.set(type, factory);
}

export function createAgent(type: AgentType, bus?: MessageBus): BaseAgent {
  const factory = agentFactories.get(type);
  if (!factory) {
    throw new Error(`No factory registered for agent type: ${type}`);
  }
  return factory(bus);
}

export function getAgentFactory(type: AgentType): AgentFactory | undefined {
  return agentFactories.get(type);
}

export function listAgentTypes(): AgentType[] {
  return Array.from(agentFactories.keys());
}
