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
// Circuit Breaker
// ============================================================================

export type CircuitState = 'closed' | 'open' | 'half-open';

export interface CircuitBreakerConfig {
  /** Consecutive failures before opening the circuit */
  failureThreshold: number;
  /** Time in ms before trying half-open recovery */
  resetTimeout: number;
  /** Successes needed in half-open to close the circuit */
  halfOpenSuccesses: number;
}

const DEFAULT_CIRCUIT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  resetTimeout: 30000,   // 30s
  halfOpenSuccesses: 2,
};

export class CircuitBreaker {
  state: CircuitState = 'closed';
  consecutiveFailures = 0;
  consecutiveSuccesses = 0;
  lastFailureTime = 0;
  totalTrips = 0;

  constructor(private config: CircuitBreakerConfig = DEFAULT_CIRCUIT_CONFIG) {}

  /** Record a successful operation */
  recordSuccess(): void {
    if (this.state === 'half-open') {
      this.consecutiveSuccesses++;
      if (this.consecutiveSuccesses >= this.config.halfOpenSuccesses) {
        this.close();
      }
    } else {
      this.consecutiveFailures = 0;
      this.consecutiveSuccesses++;
    }
  }

  /** Record a failed operation */
  recordFailure(): void {
    this.consecutiveFailures++;
    this.consecutiveSuccesses = 0;
    this.lastFailureTime = Date.now();

    if (this.state === 'half-open') {
      this.open();
    } else if (this.consecutiveFailures >= this.config.failureThreshold) {
      this.open();
    }
  }

  /** Check if the circuit allows a request through */
  canExecute(): boolean {
    if (this.state === 'closed') return true;

    if (this.state === 'open') {
      // Check if reset timeout has elapsed for half-open transition
      if (Date.now() - this.lastFailureTime >= this.config.resetTimeout) {
        this.state = 'half-open';
        this.consecutiveSuccesses = 0;
        return true;
      }
      return false;
    }

    // half-open: allow limited traffic
    return true;
  }

  private open(): void {
    this.state = 'open';
    this.totalTrips++;
    this.consecutiveSuccesses = 0;
  }

  private close(): void {
    this.state = 'closed';
    this.consecutiveFailures = 0;
    this.consecutiveSuccesses = 0;
  }

  getStatus(): { state: CircuitState; failures: number; trips: number; lastFailure: number } {
    return {
      state: this.state,
      failures: this.consecutiveFailures,
      trips: this.totalTrips,
      lastFailure: this.lastFailureTime,
    };
  }
}

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

  // Circuit breaker for resilience
  readonly circuitBreaker: CircuitBreaker;
  private autoRestartTimer: NodeJS.Timeout | null = null;

  constructor(config: AgentConfig, bus: MessageBus = messageBus) {
    this.id = config.id || `${config.type}-${randomUUID().slice(0, 8)}`;
    this.type = config.type;
    this.bus = bus;
    this.maxConcurrent = config.maxConcurrent || 1;
    this.timeout = config.timeout || 30000;
    this.startTime = new Date();
    this.lastActivity = new Date();
    this.circuitBreaker = new CircuitBreaker();
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
    if (this.autoRestartTimer) {
      clearTimeout(this.autoRestartTimer);
      this.autoRestartTimer = null;
    }
    this.sleep();
    this.log('Shutdown');
  }

  // ============================================================================
  // Message Handling
  // ============================================================================

  private async handleMessage(message: Message): Promise<void> {
    // Circuit breaker check
    if (!this.circuitBreaker.canExecute()) {
      this.log(`Circuit OPEN — rejecting message ${message.id}, will retry after cooldown`);
      this.scheduleAutoRestart();
      return;
    }

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
      this.circuitBreaker.recordSuccess();
    } catch (error) {
      this.errors++;
      this.circuitBreaker.recordFailure();
      this.log(`Error processing message: ${error}`);

      if (this.circuitBreaker.state === 'open') {
        this.state = 'error';
        this.log(`Circuit OPENED after ${this.circuitBreaker.consecutiveFailures} consecutive failures`);
        this.scheduleAutoRestart();
      }

      // Send error response
      await this.sendError(message, error);
    } finally {
      this.currentTasks--;
      if (this.currentTasks === 0 && this.circuitBreaker.state !== 'open') {
        this.state = 'idle';
      }
    }
  }

  /**
   * Schedule automatic restart attempt when circuit is open
   */
  private scheduleAutoRestart(): void {
    if (this.autoRestartTimer) return; // Already scheduled

    const resetTimeout = this.circuitBreaker['config'].resetTimeout;
    this.autoRestartTimer = setTimeout(() => {
      this.autoRestartTimer = null;
      if (this.circuitBreaker.state === 'open' || this.state === 'error') {
        this.log('Attempting auto-restart (half-open)...');
        this.state = 'idle'; // Allow messages through
      }
    }, resetTimeout);
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

  health(): HealthStatus & { circuitBreaker: ReturnType<CircuitBreaker['getStatus']> } {
    return {
      agentId: this.id,
      state: this.state,
      uptime: Date.now() - this.startTime.getTime(),
      messagesProcessed: this.messagesProcessed,
      errors: this.errors,
      lastActivity: this.lastActivity,
      circuitBreaker: this.circuitBreaker.getStatus(),
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
      console.debug(`[${this.type}:${this.id.slice(-8)}] DEBUG: ${message}`);
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
