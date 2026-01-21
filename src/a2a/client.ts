/**
 * Genesis A2A Client
 *
 * Client for discovering and communicating with remote Genesis agents.
 * Supports HTTP, WebSocket, and MessageBus transports.
 */

import { EventEmitter } from 'events';
import * as crypto from 'crypto';
import {
  A2AAgentId,
  A2AMessage,
  A2AResponse,
  A2AMethod,
  A2AEndpoint,
  A2ASignature,
  A2AKeyPair,
  AgentCapability,
  AgentAnnouncement,
  TaskRequest,
  TaskResult,
  TaskProgress,
  TrustScore,
  TrustLevel,
  PaymentQuote,
  PaymentCommitment,
  createA2AMessage,
  createTaskRequest,
  A2A_PROTOCOL_VERSION,
  TaskParams,
  DiscoveryParams,
  CapabilityParams,
  TrustParams,
  PaymentParams,
} from './protocol.js';

// ============================================================================
// Types
// ============================================================================

export interface A2AClientConfig {
  agentId: A2AAgentId;
  keyPair: A2AKeyPair;
  directory?: AgentDirectory;
  defaultTimeout?: number;
  autoRetry?: boolean;
  maxRetries?: number;
  debug?: boolean;
}

export interface AgentDirectory {
  lookup(agentId: A2AAgentId): Promise<AgentAnnouncement | null>;
  search(query: {
    capabilities?: string[];
    minTrust?: number;
    limit?: number;
  }): Promise<AgentAnnouncement[]>;
  register(announcement: AgentAnnouncement): Promise<void>;
  unregister(agentId: A2AAgentId): Promise<void>;
}

export interface PendingRequest {
  resolve: (response: A2AResponse) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
  created: Date;
}

export interface A2AClientEvents {
  connected: (endpoint: A2AEndpoint) => void;
  disconnected: (endpoint: A2AEndpoint) => void;
  message: (message: A2AMessage) => void;
  response: (response: A2AResponse) => void;
  error: (error: Error) => void;
  'task:progress': (taskId: string, progress: TaskProgress) => void;
  'task:complete': (taskId: string, result: TaskResult) => void;
}

// ============================================================================
// A2A Client Class
// ============================================================================

export class A2AClient extends EventEmitter {
  private config: A2AClientConfig;
  private connections: Map<string, unknown> = new Map();
  private pendingRequests: Map<string, PendingRequest> = new Map();
  private knownAgents: Map<A2AAgentId, AgentAnnouncement> = new Map();
  private trustCache: Map<A2AAgentId, TrustScore> = new Map();

  private metrics = {
    requestsSent: 0,
    responsesReceived: 0,
    errors: 0,
    avgLatency: 0,
    tasksDelegated: 0,
    tasksCompleted: 0,
  };

  constructor(config: A2AClientConfig) {
    super();
    this.config = {
      defaultTimeout: 30000,
      autoRetry: true,
      maxRetries: 3,
      debug: false,
      ...config,
    };
  }

  // ============================================================================
  // Discovery
  // ============================================================================

  async discover(
    options: {
      capabilities?: string[];
      minTrust?: number;
      limit?: number;
    } = {}
  ): Promise<AgentAnnouncement[]> {
    if (this.config.directory) {
      return this.config.directory.search(options);
    }

    const message = createA2AMessage('a2a.discover', {
      from: this.config.agentId,
      filter: {
        capabilities: options.capabilities,
        minTrust: options.minTrust,
        limit: options.limit,
      },
    } as DiscoveryParams);

    this.log('Broadcasting discovery request');
    return Array.from(this.knownAgents.values());
  }

  async ping(agentId: A2AAgentId): Promise<{ latency: number; version: string }> {
    const startTime = Date.now();

    const response = await this.sendRequest(agentId, 'a2a.ping', {
      from: this.config.agentId,
      to: agentId,
    } as DiscoveryParams);

    return {
      latency: Date.now() - startTime,
      version: (response.result as { version: string })?.version || 'unknown',
    };
  }

  async announce(announcement: AgentAnnouncement): Promise<void> {
    if (this.config.directory) {
      await this.config.directory.register(announcement);
    }

    this.knownAgents.set(this.config.agentId, announcement);
    this.log(`Announced agent ${this.config.agentId}`);
  }

  registerAgent(announcement: AgentAnnouncement): void {
    this.knownAgents.set(announcement.agentId, announcement);
  }

  // ============================================================================
  // Capability Queries
  // ============================================================================

  async getCapabilities(agentId: A2AAgentId): Promise<AgentCapability[]> {
    const response = await this.sendRequest(agentId, 'a2a.capabilities.list', {
      from: this.config.agentId,
      to: agentId,
    } as CapabilityParams);

    return (response.result as { capabilities: AgentCapability[] })?.capabilities || [];
  }

  async queryCapabilities(query: {
    category?: string;
    tags?: string[];
    search?: string;
    maxCostTier?: string;
  }): Promise<Array<{ agent: AgentAnnouncement; capability: AgentCapability }>> {
    const results: Array<{ agent: AgentAnnouncement; capability: AgentCapability }> = [];

    for (const agent of this.knownAgents.values()) {
      for (const cap of agent.capabilities) {
        let matches = true;

        if (query.category && cap.category !== query.category) matches = false;
        if (query.tags && !query.tags.some((t) => cap.tags?.includes(t))) matches = false;
        if (query.search && !cap.name.toLowerCase().includes(query.search.toLowerCase())) {
          matches = false;
        }

        if (matches) {
          results.push({ agent, capability: cap });
        }
      }
    }

    return results;
  }

  // ============================================================================
  // Task Delegation
  // ============================================================================

  async delegateTask(
    agentId: A2AAgentId,
    capabilityId: string,
    input: Record<string, unknown>,
    options: {
      priority?: TaskRequest['priority'];
      timeout?: number;
      payment?: PaymentCommitment;
      onProgress?: (progress: TaskProgress) => void;
    } = {}
  ): Promise<TaskResult> {
    this.metrics.tasksDelegated++;

    const trust = await this.getTrust(agentId);
    const capability = await this.findCapability(agentId, capabilityId);

    if (capability?.requiredTrust) {
      const requiredLevel = this.trustLevelToScore(capability.requiredTrust);
      if (trust.overall < requiredLevel) {
        throw new Error(`Insufficient trust: ${trust.overall} < ${requiredLevel}`);
      }
    }

    let payment = options.payment;
    if (capability && capability.costTier !== 'free' && !payment) {
      const quote = await this.getQuote(agentId, capabilityId, input);
      payment = await this.commitPayment(quote);
    }

    const message = createTaskRequest(this.config.agentId, agentId, capabilityId, input, {
      priority: options.priority,
      timeout: options.timeout || this.config.defaultTimeout,
      payment,
    });

    const taskId = (message.params as TaskParams).task!.id;

    if (options.onProgress) {
      const progressHandler = (progress: TaskProgress) => {
        if (progress.taskId === taskId) {
          options.onProgress!(progress);
        }
      };
      this.on('task:progress', progressHandler);

      this.once('task:complete', (completedId) => {
        if (completedId === taskId) {
          this.off('task:progress', progressHandler);
        }
      });
    }

    const response = await this.sendRequest(agentId, 'a2a.task.request', message.params, {
      timeout: options.timeout || this.config.defaultTimeout! * 2,
    });

    if ((response.result as { accepted: boolean })?.accepted === false) {
      throw new Error((response.result as { reason: string })?.reason || 'Task rejected');
    }

    const result = await this.waitForTaskCompletion(taskId, options.timeout);

    this.metrics.tasksCompleted++;
    return result;
  }

  async cancelTask(agentId: A2AAgentId, taskId: string, reason?: string): Promise<void> {
    await this.sendRequest(agentId, 'a2a.task.cancel', {
      from: this.config.agentId,
      to: agentId,
      taskId,
      reason,
    } as TaskParams);
  }

  private async waitForTaskCompletion(taskId: string, timeout?: number): Promise<TaskResult> {
    return new Promise((resolve, reject) => {
      const timeoutMs = timeout || this.config.defaultTimeout! * 2;

      const timeoutId = setTimeout(() => {
        this.off('task:complete', handler);
        reject(new Error(`Task ${taskId} timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      const handler = (completedId: string, result: TaskResult) => {
        if (completedId === taskId) {
          clearTimeout(timeoutId);
          this.off('task:complete', handler);
          resolve(result);
        }
      };

      this.on('task:complete', handler);
    });
  }

  // ============================================================================
  // Result Validation
  // ============================================================================

  async validateResult(
    agentId: A2AAgentId,
    taskId: string,
    result: TaskResult
  ): Promise<{ valid: boolean; score: number; issues?: string[] }> {
    const response = await this.sendRequest(agentId, 'a2a.result.validate', {
      from: this.config.agentId,
      to: agentId,
      taskId,
      result,
    });

    return response.result as { valid: boolean; score: number; issues?: string[] };
  }

  async disputeResult(
    agentId: A2AAgentId,
    taskId: string,
    reason: string,
    resolution: 'refund' | 'redo' | 'partial-refund' | 'arbitration'
  ): Promise<void> {
    await this.sendRequest(agentId, 'a2a.result.dispute', {
      from: this.config.agentId,
      to: agentId,
      taskId,
      dispute: { taskId, reason, resolution },
    });
  }

  // ============================================================================
  // Trust & Reputation
  // ============================================================================

  async getTrust(agentId: A2AAgentId): Promise<TrustScore> {
    const cached = this.trustCache.get(agentId);
    if (cached) {
      return cached;
    }

    try {
      const response = await this.sendRequest(agentId, 'a2a.trust.query', {
        from: this.config.agentId,
        query: { agentId },
      } as TrustParams);

      const trust = response.result as TrustScore;
      this.trustCache.set(agentId, trust);
      return trust;
    } catch {
      return this.getDefaultTrust(agentId);
    }
  }

  async attestTrust(
    agentId: A2AAgentId,
    type: 'task-completion' | 'quality' | 'behavior',
    rating: number,
    taskId?: string,
    comment?: string
  ): Promise<void> {
    const attestation = {
      id: crypto.randomUUID(),
      from: this.config.agentId,
      about: agentId,
      type,
      rating,
      taskId,
      comment,
      timestamp: new Date().toISOString(),
      signature: this.sign(JSON.stringify({ agentId, type, rating, taskId })),
    };

    await this.sendRequest(agentId, 'a2a.trust.attest', {
      from: this.config.agentId,
      to: agentId,
      about: agentId,
      attestation,
    } as TrustParams);

    this.trustCache.delete(agentId);
  }

  async reportAgent(
    agentId: A2AAgentId,
    type: 'spam' | 'fraud' | 'abuse' | 'quality' | 'payment',
    severity: 'low' | 'medium' | 'high' | 'critical',
    description: string,
    evidence?: unknown
  ): Promise<void> {
    await this.sendRequest(agentId, 'a2a.trust.report', {
      from: this.config.agentId,
      about: agentId,
      report: {
        id: crypto.randomUUID(),
        from: this.config.agentId,
        about: agentId,
        type,
        severity,
        description,
        evidence,
      },
    } as TrustParams);
  }

  // ============================================================================
  // Payment
  // ============================================================================

  async getQuote(
    agentId: A2AAgentId,
    capabilityId: string,
    estimatedInput?: Record<string, unknown>
  ): Promise<PaymentQuote> {
    const response = await this.sendRequest(agentId, 'a2a.payment.quote', {
      from: this.config.agentId,
      to: agentId,
      quote: {
        id: crypto.randomUUID(),
        capabilityId,
        estimatedInput,
        price: 0,
        currency: 'credits',
        validUntil: new Date(Date.now() + 3600000).toISOString(),
      },
    } as PaymentParams);

    return response.result as PaymentQuote;
  }

  async negotiatePayment(
    agentId: A2AAgentId,
    quoteId: string,
    counterOffer?: number
  ): Promise<{ accepted: boolean; finalPrice?: number }> {
    const response = await this.sendRequest(agentId, 'a2a.payment.negotiate', {
      from: this.config.agentId,
      to: agentId,
      negotiation: { quoteId, counterOffer, round: 1 },
    } as PaymentParams);

    return response.result as { accepted: boolean; finalPrice?: number };
  }

  async commitPayment(quote: PaymentQuote): Promise<PaymentCommitment> {
    return {
      id: crypto.randomUUID(),
      quoteId: quote.id,
      amount: quote.price,
      currency: quote.currency,
      conditions: [{ type: 'task-complete' }],
    };
  }

  async releasePayment(
    agentId: A2AAgentId,
    commitmentId: string,
    taskId: string,
    reason: 'completed' | 'partial' | 'refund' = 'completed'
  ): Promise<void> {
    await this.sendRequest(agentId, 'a2a.payment.release', {
      from: this.config.agentId,
      to: agentId,
      release: { commitmentId, amount: 0, taskId, reason },
    } as PaymentParams);
  }

  // ============================================================================
  // Transport Layer
  // ============================================================================

  private async sendRequest(
    agentId: A2AAgentId,
    method: A2AMethod,
    params: unknown,
    options: { timeout?: number } = {}
  ): Promise<A2AResponse> {
    const message = createA2AMessage(method, params as A2AMessage['params']);
    message.signature = this.sign(JSON.stringify({ method, params }));

    this.metrics.requestsSent++;

    return this.sendWithRetry(agentId, message, options.timeout);
  }

  private async sendWithRetry(
    agentId: A2AAgentId,
    message: A2AMessage,
    timeout?: number,
    attempt = 1
  ): Promise<A2AResponse> {
    try {
      return await this.send(agentId, message, timeout);
    } catch (error) {
      if (this.config.autoRetry && attempt < (this.config.maxRetries || 3)) {
        const delay = Math.pow(2, attempt) * 1000;
        await new Promise((resolve) => setTimeout(resolve, delay));
        return this.sendWithRetry(agentId, message, timeout, attempt + 1);
      }
      throw error;
    }
  }

  private async send(
    agentId: A2AAgentId,
    message: A2AMessage,
    timeout?: number
  ): Promise<A2AResponse> {
    const agent = this.knownAgents.get(agentId);
    if (!agent) {
      if (this.config.directory) {
        const discovered = await this.config.directory.lookup(agentId);
        if (discovered) {
          this.knownAgents.set(agentId, discovered);
          return this.send(agentId, message, timeout);
        }
      }
      throw new Error(`Unknown agent: ${agentId}`);
    }

    const endpoint = this.selectEndpoint(agent.endpoints);

    switch (endpoint.transport) {
      case 'http':
        return this.sendHttp(endpoint, message, timeout);
      case 'websocket':
        throw new Error('WebSocket transport not yet implemented');
      case 'messagebus':
        throw new Error('MessageBus transport not yet implemented');
      default:
        throw new Error(`Unsupported transport: ${endpoint.transport}`);
    }
  }

  private selectEndpoint(endpoints: A2AEndpoint[]): A2AEndpoint {
    const ws = endpoints.find((e) => e.transport === 'websocket');
    if (ws) return ws;

    const http = endpoints.find((e) => e.transport === 'http');
    if (http) return http;

    return endpoints[0];
  }

  private async sendHttp(
    endpoint: A2AEndpoint,
    message: A2AMessage,
    timeout?: number
  ): Promise<A2AResponse> {
    const url = endpoint.secure ? `https://${endpoint.url}` : `http://${endpoint.url}`;
    const port = endpoint.port ? `:${endpoint.port}` : '';

    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      timeout || this.config.defaultTimeout
    );

    try {
      const response = await fetch(`${url}${port}/a2a`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-A2A-Protocol': A2A_PROTOCOL_VERSION,
        },
        body: JSON.stringify(message),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = (await response.json()) as A2AResponse;
      this.metrics.responsesReceived++;

      if (result.error) {
        throw new Error(`A2A Error ${result.error.code}: ${result.error.message}`);
      }

      return result;
    } catch (error) {
      clearTimeout(timeoutId);
      this.metrics.errors++;
      throw error;
    }
  }

  // ============================================================================
  // Cryptography
  // ============================================================================

  private sign(data: string): A2ASignature {
    const nonce = crypto.randomUUID();
    const timestamp = new Date().toISOString();
    const payload = `${data}:${nonce}:${timestamp}`;

    const signature = crypto
      .createHmac('sha256', this.config.keyPair.privateKey)
      .update(payload)
      .digest('hex');

    return {
      algorithm: this.config.keyPair.algorithm,
      publicKey: this.config.keyPair.publicKey,
      value: signature,
      timestamp,
      nonce,
    };
  }

  // ============================================================================
  // Utilities
  // ============================================================================

  private async findCapability(
    agentId: A2AAgentId,
    capabilityId: string
  ): Promise<AgentCapability | null> {
    const agent = this.knownAgents.get(agentId);
    if (agent) {
      return agent.capabilities.find((c) => c.id === capabilityId) || null;
    }

    const capabilities = await this.getCapabilities(agentId);
    return capabilities.find((c) => c.id === capabilityId) || null;
  }

  private getDefaultTrust(agentId: A2AAgentId): TrustScore {
    return {
      agentId,
      overall: 0.5,
      components: {
        reliability: 0.5,
        quality: 0.5,
        responsiveness: 0.5,
        financial: 0.5,
      },
      level: 'basic',
      interactions: 0,
      confidence: 0.1,
    };
  }

  private trustLevelToScore(level: TrustLevel): number {
    const levels: Record<TrustLevel, number> = {
      untrusted: 0,
      minimal: 0.2,
      basic: 0.4,
      verified: 0.6,
      trusted: 0.8,
      'highly-trusted': 0.95,
    };
    return levels[level] || 0;
  }

  private log(message: string): void {
    if (this.config.debug) {
      console.log(`[A2AClient:${this.config.agentId.split(':').pop()}] ${message}`);
    }
  }

  // ============================================================================
  // Metrics
  // ============================================================================

  getMetrics() {
    return {
      ...this.metrics,
      knownAgents: this.knownAgents.size,
      pendingRequests: this.pendingRequests.size,
    };
  }
}

// ============================================================================
// Key Generation Utility
// ============================================================================

export function generateA2AKeyPair(): A2AKeyPair {
  const id = crypto.randomUUID();
  const privateKey = crypto.randomBytes(32).toString('hex');
  const publicKey = crypto.createHash('sha256').update(privateKey).digest('hex');

  return {
    keyId: id,
    privateKey,
    publicKey,
    algorithm: 'ed25519',
    created: new Date().toISOString(),
  };
}
